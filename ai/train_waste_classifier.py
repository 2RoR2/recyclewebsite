import argparse
import json
from pathlib import Path

import tensorflow as tf


IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32
SEED = 42
DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "datasets"


def count_images_by_class(data_dir):
    image_extensions = {".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"}
    counts = {}

    for class_dir in sorted(path for path in data_dir.iterdir() if path.is_dir()):
        counts[class_dir.name] = sum(
            1
            for file_path in class_dir.rglob("*")
            if file_path.is_file() and file_path.suffix.lower() in image_extensions
        )

    return counts


def make_class_weight(class_names, image_counts):
    total = sum(image_counts.values())
    class_count = len(class_names)

    return {
        index: total / (class_count * max(image_counts.get(class_name, 1), 1))
        for index, class_name in enumerate(class_names)
    }


def build_model(class_count):
    base = tf.keras.applications.MobileNetV2(
        input_shape=(*IMAGE_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    base.trainable = False

    inputs = tf.keras.Input(shape=(*IMAGE_SIZE, 3))
    x = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.08),
            tf.keras.layers.RandomZoom(0.12),
            tf.keras.layers.RandomContrast(0.18),
            tf.keras.layers.RandomBrightness(0.12),
        ],
        name="waste_augmentation",
    )(inputs)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.35)(x)
    outputs = tf.keras.layers.Dense(class_count, activation="softmax")(x)
    model = tf.keras.Model(inputs, outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0003),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main():
    parser = argparse.ArgumentParser(description="Train EcoCycle Sarawak waste classifier.")
    parser.add_argument("--data", default=str(DEFAULT_DATA_DIR), help="Dataset folder with class subfolders.")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--out", default="ai/models")
    args = parser.parse_args()

    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not data_dir.exists():
        raise FileNotFoundError(f"Dataset folder was not found: {data_dir}")

    image_counts = count_images_by_class(data_dir)
    if len(image_counts) < 2:
        raise ValueError("Dataset must contain at least two class folders with images.")

    print("Dataset:")
    for class_name, count in image_counts.items():
        print(f"- {class_name}: {count} images")

    train_ds = tf.keras.utils.image_dataset_from_directory(
        data_dir,
        validation_split=0.2,
        subset="training",
        seed=SEED,
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        data_dir,
        validation_split=0.2,
        subset="validation",
        seed=SEED,
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
    )

    class_names = train_ds.class_names
    class_weight = make_class_weight(class_names, image_counts)

    print("Classes:", ", ".join(class_names))
    print("Class weights:", class_weight)

    train_ds = train_ds.cache().shuffle(1000).prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.cache().prefetch(tf.data.AUTOTUNE)

    model = build_model(len(class_names))
    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(out_dir / "waste_classifier.keras", save_best_only=True),
    ]
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
        class_weight=class_weight,
    )
    model.save(out_dir / "waste_classifier.keras")
    (out_dir / "class_names.json").write_text(json.dumps(class_names, indent=2), encoding="utf-8")
    (out_dir / "training_history.json").write_text(json.dumps(history.history, indent=2), encoding="utf-8")

    val_loss, val_accuracy = model.evaluate(val_ds, verbose=0)
    print(f"Validation accuracy: {val_accuracy * 100:.2f}%")
    print(f"Validation loss: {val_loss:.4f}")


if __name__ == "__main__":
    main()
