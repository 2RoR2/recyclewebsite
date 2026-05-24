import assert from "node:assert/strict";
import { state } from "../src/backend/database.js";
import { recyclingService } from "../src/backend/services.js";
import { getScanTarget } from "../src/features/qr/scan-routing.js";
import { pointInRect, selectedZoneSourceRectFromRects } from "../src/features/ai/zone-crop.js";
import { simulateAiDetection, validateSimulatedDisposal } from "../src/features/ai/simulation.js";
import { categoryFromCocoClass, detectionFromCocoPredictions, detectionFromCustomPrediction, normalizeWasteCategory } from "../src/features/ai/browser-detector.js";

const plasticBin = state.bins.find((bin) => bin.qrCode === "SAR-PLA");
const stationPaperBin = state.bins.find((bin) => bin.qrCode === "SAR-PAP");

assert.ok(plasticBin, "Expected SAR-PLA bin fixture to exist.");
assert.ok(stationPaperBin, "Expected SAR-PAP bin fixture to exist.");

assert.deepEqual(
  getScanTarget("SAR-PLA", state.bins, "http://localhost"),
  { type: "bin", code: "SAR-PLA" },
  "Exact QR codes must route to the exact bin, not just the station."
);

assert.deepEqual(
  getScanTarget("http://localhost/?bin=SAR-PLA", state.bins, "http://localhost"),
  { type: "bin", code: "SAR-PLA" },
  "QR URLs with ?bin= must route to the exact bin."
);

assert.deepEqual(
  getScanTarget("http://localhost/?station=SAR", state.bins, "http://localhost"),
  { type: "station", code: "SAR" },
  "QR URLs with ?station= must route to the station."
);

const user = state.users.find((item) => item.role === "user");
assert.ok(user, "Expected demo user to exist.");

const startingRecords = state.records.length;
const startingTransactions = (state.transactions || []).length;
const startingPoints = user.points;

state.currentUserId = user.id;
state.selectedBinId = plasticBin.id;
state.sensorCheck = {
  captured: true,
  confidence: 94,
  zone: "Plastic",
  manualZone: "Plastic",
  presenceDetected: true,
};
state.aiDetection = {
  label: "Plastic Bottle",
  category: "Plastic",
  confidence: 94,
  detectorAvailable: true,
};
state.locationCheck = {
  verified: true,
  distance: 4,
};

const message = recyclingService.recordWaste();

assert.match(message, /earned 1 point/i, "Accurate scan should award one point.");
assert.equal(state.records.length, startingRecords + 1, "Accurate scan should save a waste record.");
assert.equal(state.transactions.length, startingTransactions + 1, "Accurate scan should save a Firestore transaction.");
assert.equal(user.points, startingPoints + 1, "Accurate scan should save updated user points.");
assert.equal(state.records[0].binId, plasticBin.id, "Saved record should use the scanned bin.");
assert.equal(state.records[0].status, "Valid", "Saved record should be valid for an accurate scan.");
assert.deepEqual(
  {
    userId: state.transactions[0].userId,
    binId: state.transactions[0].binId,
    wasteType: state.transactions[0].wasteType,
    result: state.transactions[0].result,
    points: state.transactions[0].points,
  },
  {
    userId: user.id,
    binId: plasticBin.id,
    wasteType: "Plastic",
    result: "Correct",
    points: 1,
  },
  "Transaction should contain the validation fields needed by Firebase."
);

const recordsAfterValidScan = state.records.length;
const transactionsAfterValidScan = state.transactions.length;
state.currentUserId = user.id;
state.selectedBinId = plasticBin.id;
state.sensorCheck = {
  captured: true,
  confidence: 0,
  zone: "Plastic",
  manualZone: "Plastic",
  presenceDetected: false,
};
state.aiDetection = {
  label: "no item",
  category: "General Waste",
  confidence: 0,
  detectorAvailable: true,
  presenceDetected: false,
};
state.locationCheck = {
  verified: true,
  distance: 4,
};

const noItemMessage = recyclingService.recordWaste();
assert.match(noItemMessage, /No rubbish item was detected/, "Empty selected zone must not be recorded.");
assert.equal(state.records.length, recordsAfterValidScan, "Empty selected zone must not add a waste record.");
assert.equal(state.transactions.length, transactionsAfterValidScan, "Empty selected zone must not add a transaction.");

const videoRect = { left: 100, top: 50, width: 800, height: 450 };
const zoneWidth = videoRect.width / 4;
const zoneRects = ["Paper", "Plastic", "Aluminium", "General Waste"].map((zone, index) => ({
  zone,
  rect: { left: videoRect.left + (zoneWidth * index), top: videoRect.top, width: zoneWidth, height: videoRect.height },
}));

const cropRects = Object.fromEntries(
  zoneRects.map(({ zone, rect }) => [
    zone,
    selectedZoneSourceRectFromRects({
      frameWidth: 1280,
      frameHeight: 720,
      videoRect,
      zoneRect: rect,
    }),
  ])
);

assert.ok(cropRects.Plastic.x > cropRects.Paper.x, "Plastic crop should be to the right of Paper crop.");
assert.ok(cropRects.Aluminium.x > cropRects.Plastic.x, "Aluminium crop should be to the right of Plastic crop.");

const plasticItemPoint = { x: cropRects.Plastic.x + (cropRects.Plastic.width / 2), y: cropRects.Plastic.y + (cropRects.Plastic.height / 2) };
const paperItemPoint = { x: cropRects.Paper.x + (cropRects.Paper.width / 2), y: cropRects.Paper.y + (cropRects.Paper.height / 2) };

assert.equal(pointInRect(plasticItemPoint, cropRects.Plastic), true, "Item in selected Plastic zone should be included.");
assert.equal(pointInRect(paperItemPoint, cropRects.Plastic), false, "Item outside selected Plastic zone should be excluded.");

assert.deepEqual(
  validateSimulatedDisposal("Plastic", "Plastic Bottle"),
  {
    status: "correct",
    points: 1,
    message: "Correct disposal! +1 point earned.",
  },
  "Simulated Plastic Bottle in Plastic zone should be correct."
);

assert.deepEqual(
  validateSimulatedDisposal("Paper", "Plastic Bottle"),
  {
    status: "wrong",
    points: 0,
    message: "Wrong bin detected. No point added.",
  },
  "Simulated Plastic Bottle in Paper zone should be wrong."
);

assert.deepEqual(
  simulateAiDetection(() => 0.52),
  { label: "Aluminium Can", category: "Aluminium" },
  "Simulated AI detection should support the Aluminium zone."
);

assert.equal(categoryFromCocoClass("book"), "Paper", "Browser AI should map COCO book to Paper.");
assert.equal(categoryFromCocoClass("bottle"), "Plastic", "Browser AI should map COCO bottle to Plastic.");
assert.equal(categoryFromCocoClass("spoon"), "Aluminium", "Browser AI should map COCO metal utensils to Aluminium.");
assert.equal(categoryFromCocoClass("banana"), "General Waste", "Browser AI should map food objects to General Waste.");

assert.deepEqual(
  detectionFromCocoPredictions([{ class: "bottle", score: 0.91, bbox: [1, 2, 3, 4] }]),
  {
    label: "Plastic Bottle",
    category: "Plastic",
    confidence: 91,
    rawConfidence: 91,
    topPredictions: [{ label: "bottle", confidence: 91 }],
    box: { x: 1, y: 2, width: 3, height: 4 },
    model: "TensorFlow.js COCO-SSD",
    presenceDetected: true,
    detectorAvailable: true,
    browserAi: true,
  },
  "Browser AI prediction should normalize into the app detection format."
);

assert.equal(
  detectionFromCocoPredictions([{ class: "person", score: 0.99, bbox: [1, 2, 3, 4] }]).presenceDetected,
  false,
  "Browser AI should ignore unsupported non-waste classes."
);

assert.equal(normalizeWasteCategory("Aluminium Can"), "Aluminium", "Custom model labels should normalize to Aluminium.");
assert.equal(normalizeWasteCategory("General Waste"), "General Waste", "Custom model labels should normalize to General Waste.");

assert.deepEqual(
  detectionFromCustomPrediction(["Paper", "Plastic", "Aluminium", "General Waste"], [0.02, 0.92, 0.04, 0.02]),
  {
    label: "Plastic",
    category: "Plastic",
    confidence: 92,
    rawConfidence: 92,
    topPredictions: [
      { label: "Plastic", category: "Plastic", confidence: 92 },
      { label: "Aluminium", category: "Aluminium", confidence: 4 },
      { label: "Paper", category: "Paper", confidence: 2 },
    ],
    box: null,
    model: "Custom TensorFlow.js waste model",
    presenceDetected: true,
    detectorAvailable: true,
    browserAi: true,
    customWasteModel: true,
  },
  "Custom browser waste model predictions should map directly to project categories."
);

console.log("Core QR, database save, and AI zone crop checks passed.");
