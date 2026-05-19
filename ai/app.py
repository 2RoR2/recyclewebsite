import json
from io import BytesIO
from pathlib import Path
from datetime import datetime

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import uvicorn


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "waste_classifier.keras"
CLASS_NAMES_PATH = ROOT / "models" / "class_names.json"
DATASET_PATH = ROOT / "datasets"
REVIEW_PATH = ROOT / "review_samples"
IMAGE_SIZE = (224, 224)
CATEGORY_FOLDERS = {
    "Paper": "paper",
    "Plastic": "plastic",
    "Aluminium": "aluminium",
    "General Waste": "general_waste",
}

app = FastAPI(title="EcoCycle Sarawak AI Detector")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

custom_model = None
class_names = []
imagenet_model = None


def load_custom_model():
    global custom_model, class_names
    if custom_model is not None:
        return custom_model
    if MODEL_PATH.exists() and CLASS_NAMES_PATH.exists():
        custom_model = tf.keras.models.load_model(MODEL_PATH)
        class_names = json.loads(CLASS_NAMES_PATH.read_text(encoding="utf-8"))
    return custom_model


def load_imagenet_model():
    global imagenet_model
    if imagenet_model is None:
        imagenet_model = tf.keras.applications.MobileNetV2(weights="imagenet")
    return imagenet_model


def normalize_category(label):
    text = label.lower().replace("_", " ")
    aluminium_can_terms = ["aluminium", "aluminum", "tin", "beverage can", "soda can"]
    plastic_terms = ["plastic", "bottle", "water bottle", "pop bottle", "cup"]
    paper_terms = ["paper", "cardboard", "carton", "envelope", "book", "newspaper"]
    general_waste_terms = ["wrapper", "tissue", "food", "dirty", "trash", "rubbish", "waste"]

    if any(term in text for term in aluminium_can_terms):
        return "Aluminium"
    if any(term in text for term in plastic_terms):
        return "Plastic"
    if any(term in text for term in paper_terms):
        return "Paper"
    if any(term in text for term in general_waste_terms):
        return "General Waste"
    return "General Waste"


def image_array(image_bytes):
    image = Image.open(BytesIO(image_bytes)).convert("RGB").resize(IMAGE_SIZE)
    return np.expand_dims(np.asarray(image), axis=0)


@app.get("/health")
def health():
    return {"ok": True, "modelReady": MODEL_PATH.exists()}


@app.post("/detect-waste")
async def detect_waste(image: UploadFile = File(...)):
    image_bytes = await image.read()
    model = load_custom_model()

    if model is not None:
        array = image_array(image_bytes).astype(np.float32)
        prediction = model.predict(array, verbose=0)[0]
        index = int(np.argmax(prediction))
        label = class_names[index]
        confidence = round(float(prediction[index]) * 100)
        category = normalize_category(label)
        model_name = "Custom TensorFlow waste classifier"
    else:
        array = tf.keras.applications.mobilenet_v2.preprocess_input(image_array(image_bytes).astype(np.float32))
        prediction = load_imagenet_model().predict(array, verbose=0)
        decoded_prediction = tf.keras.applications.mobilenet_v2.decode_predictions(prediction, top=1)[0][0]
        label = decoded_prediction[1]
        confidence = round(float(decoded_prediction[2]) * 100)
        category = normalize_category(label)
        model_name = "MobileNetV2 ImageNet fallback"

    return {
        "label": label.replace("_", " "),
        "category": category,
        "confidence": confidence,
        "box": {"x": 96, "y": 72, "width": 320, "height": 320},
        "model": model_name,
        "presenceDetected": True,
    }


@app.post("/collect-sample")
async def collect_sample(
    image: UploadFile = File(...),
    category: str = Form(...),
    detected_category: str = Form(""),
    confidence: float = Form(0),
    station: str = Form(""),
    zone: str = Form(""),
    use_for_training: bool = Form(False),
):
    image_bytes = await image.read()
    category_name = category.strip()
    folder_name = CATEGORY_FOLDERS.get(category_name)
    if not folder_name:
        return {"ok": False, "message": f"Unsupported category: {category}"}

    target_root = DATASET_PATH if use_for_training else REVIEW_PATH
    target_dir = target_root / folder_name
    target_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")
    image_path = target_dir / f"{timestamp}.jpg"
    meta_path = target_dir / f"{timestamp}.json"
    image_path.write_bytes(image_bytes)
    meta_path.write_text(
        json.dumps(
            {
                "category": category_name,
                "detectedCategory": detected_category,
                "confidence": confidence,
                "station": station,
                "zone": zone,
                "useForTraining": use_for_training,
                "createdAt": timestamp,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return {
        "ok": True,
        "stored": str(image_path.relative_to(ROOT)),
        "useForTraining": use_for_training,
    }


if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
