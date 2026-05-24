import "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";

const customModelBasePath = "/ai-model/";
const wasteCategories = ["Paper", "Plastic", "Aluminium", "General Waste"];

let cocoModelPromise = null;
let customModelPromise = null;

const supportedClasses = new Set([
  "book",
  "bottle",
  "cup",
  "fork",
  "knife",
  "spoon",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "bowl",
]);

export const categoryFromCocoClass = (className = "") => {
  const label = className.toLowerCase();

  if (["book"].includes(label)) return "Paper";
  if (["bottle", "cup"].includes(label)) return "Plastic";
  if (["fork", "knife", "spoon"].includes(label)) return "Aluminium";
  if (
    [
      "banana",
      "apple",
      "sandwich",
      "orange",
      "broccoli",
      "carrot",
      "hot dog",
      "pizza",
      "donut",
      "cake",
      "bowl",
    ].includes(label)
  ) return "General Waste";

  return "General Waste";
};

export const labelFromCocoClass = (className = "") => {
  const label = className.toLowerCase();
  const labels = {
    book: "Paper",
    bottle: "Plastic Bottle",
    cup: "Plastic Cup",
    fork: "Metal Fork",
    knife: "Metal Knife",
    spoon: "Metal Spoon",
    banana: "Food Waste",
    apple: "Food Waste",
    sandwich: "Food Waste",
    orange: "Food Waste",
    broccoli: "Food Waste",
    carrot: "Food Waste",
    "hot dog": "Food Waste",
    pizza: "Food Waste",
    donut: "Food Waste",
    cake: "Food Waste",
    bowl: "Food Container",
  };

  return labels[label] || className || "Detected Item";
};

export const detectionFromCocoPredictions = (predictions = []) => {
  const sorted = [...predictions]
    .filter((prediction) => supportedClasses.has(String(prediction.class || "").toLowerCase()))
    .filter((prediction) => Number(prediction.score) > 0)
    .sort((a, b) => b.score - a.score);
  const best = sorted[0];

  if (!best) {
    return {
      label: "no item",
      category: "General Waste",
      confidence: 0,
      rawConfidence: 0,
      topPredictions: [],
      box: null,
      model: "TensorFlow.js COCO-SSD",
      presenceDetected: false,
      detectorAvailable: true,
      browserAi: true,
    };
  }

  const confidence = Math.round(best.score * 100);
  return {
    label: labelFromCocoClass(best.class),
    category: categoryFromCocoClass(best.class),
    confidence,
    rawConfidence: confidence,
    topPredictions: sorted.slice(0, 3).map((prediction) => ({
      label: prediction.class,
      confidence: Math.round(prediction.score * 100),
    })),
    box: Array.isArray(best.bbox)
      ? { x: best.bbox[0], y: best.bbox[1], width: best.bbox[2], height: best.bbox[3] }
      : null,
    model: "TensorFlow.js COCO-SSD",
    presenceDetected: true,
    detectorAvailable: true,
    browserAi: true,
  };
};

export const normalizeWasteCategory = (label = "") => {
  const value = String(label).trim().toLowerCase();
  if (value.includes("paper") || value.includes("cardboard") || value.includes("book")) return "Paper";
  if (value.includes("plastic") || value.includes("bottle") || value.includes("cup")) return "Plastic";
  if (value.includes("aluminium") || value.includes("aluminum") || value.includes("metal") || value.includes("can")) return "Aluminium";
  if (value.includes("general") || value.includes("waste") || value.includes("food") || value.includes("trash") || value.includes("rubbish")) return "General Waste";
  return wasteCategories.includes(label) ? label : "General Waste";
};

export const detectionFromCustomPrediction = (labels, probabilities) => {
  const scored = labels
    .map((label, index) => ({
      label,
      category: normalizeWasteCategory(label),
      confidence: Math.round((Number(probabilities[index]) || 0) * 100),
    }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];

  if (!best || best.confidence < 45) {
    return {
      label: "no item",
      category: "General Waste",
      confidence: best?.confidence || 0,
      rawConfidence: best?.confidence || 0,
      topPredictions: scored.slice(0, 3),
      box: null,
      model: "Custom TensorFlow.js waste model",
      presenceDetected: false,
      detectorAvailable: true,
      browserAi: true,
      customWasteModel: true,
    };
  }

  return {
    label: best.label,
    category: best.category,
    confidence: best.confidence,
    rawConfidence: best.confidence,
    topPredictions: scored.slice(0, 3),
    box: null,
    model: "Custom TensorFlow.js waste model",
    presenceDetected: true,
    detectorAvailable: true,
    browserAi: true,
    customWasteModel: true,
  };
};

const loadCocoModel = () => {
  cocoModelPromise = cocoModelPromise || cocoSsd.load({ base: "lite_mobilenet_v2" });
  return cocoModelPromise;
};

const loadCustomWasteModel = async () => {
  if (customModelPromise) return customModelPromise;

  customModelPromise = (async () => {
    const metadataResponse = await fetch(`${customModelBasePath}metadata.json`, { cache: "no-store" });
    if (!metadataResponse.ok) throw new Error("Custom waste model metadata not found.");
    const metadata = await metadataResponse.json();
    const labels = metadata.labels || metadata.classLabels || wasteCategories;
    const model = await tf.loadLayersModel(tf.io.browserHTTPRequest(`${customModelBasePath}model.json`, {
      requestInit: { cache: "no-store" },
    }));

    return { model, labels, imageSize: Number(metadata.imageSize) || 224 };
  })().catch((error) => {
    customModelPromise = null;
    throw error;
  });

  return customModelPromise;
};

const imageFromBlob = (blob) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load camera frame for browser AI."));
    };
    image.src = url;
  });

export const detectWasteInBrowser = async (blob) => {
  if (!blob || typeof Image === "undefined") {
    throw new Error("Browser AI needs an image-capable browser environment.");
  }

  const image = await imageFromBlob(blob);

  try {
    const { model, labels, imageSize } = await loadCustomWasteModel();
    const inputShape = model.inputs?.[0]?.shape || [];
    const width = inputShape[2] || imageSize;
    const height = inputShape[1] || imageSize;
    const tensor = tf.tidy(() =>
      tf.browser
        .fromPixels(image)
        .resizeBilinear([height, width])
        .toFloat()
        .div(127.5)
        .sub(1)
        .expandDims(0)
    );
    const output = model.predict(tensor);
    const outputTensor = Array.isArray(output) ? output[0] : output;
    const probabilities = Array.from(await outputTensor.data());
    tensor.dispose();
    if (Array.isArray(output)) output.forEach((item) => item.dispose());
    else output.dispose();
    return detectionFromCustomPrediction(labels, probabilities);
  } catch {
    // If no custom waste model is deployed, fall back to the free COCO-SSD model.
  }

  const model = await loadCocoModel();
  const predictions = await model.detect(image);
  return detectionFromCocoPredictions(predictions);
};
