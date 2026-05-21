import assert from "node:assert/strict";
import { state } from "../src/backend/database.js";
import { recyclingService } from "../src/backend/services.js";
import { getScanTarget } from "../src/features/qr/scan-routing.js";

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

assert.match(message, /\+1 point/, "Accurate scan should award one point.");
assert.equal(state.records.length, startingRecords + 1, "Accurate scan should save a waste record.");
assert.equal(user.points, startingPoints + 1, "Accurate scan should save updated user points.");
assert.equal(state.records[0].binId, plasticBin.id, "Saved record should use the scanned bin.");
assert.equal(state.records[0].status, "Valid", "Saved record should be valid for an accurate scan.");

console.log("Core QR and database save checks passed.");
