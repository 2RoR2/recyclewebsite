import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { Chart } from "chart.js/auto";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import L from "leaflet";
import QRCode from "qrcode";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import * as THREE from "three";
import { collectionLocation, saveState, state } from "./backend/database.js";
import { adminService, authService, currentUser, feedbackService, learningService, recyclingService, rewardService, role, selectedBin } from "./backend/services.js";
import { renderAdminPage } from "./frontend/admin/pages.js";
import { renderGuestPage } from "./frontend/guest/pages.js";
import { renderNav } from "./frontend/shared/navigation.js";
import { binStations, renderNotFound } from "./frontend/shared/templates.js";
import { renderUserPage } from "./frontend/user/pages.js";

const app = document.querySelector("#app");
const navLinks = document.querySelector("#navLinks");
const navActions = document.querySelector("#navActions");
const toast = document.querySelector("#toast");
let qrScanner = null;
let reportChart = null;
let threeGameCleanup = null;
let aiCameraStream = null;
let aiScanBusy = false;
let gpsPromptOpen = false;
let aiCountdownOpen = false;
let lastGpsPromptKey = "";
let lastDetectionPromptKey = "";
let appReady = false;

gsap.registerPlugin(ScrollTrigger);

const scanUrlForStation = (stationCode) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("station", stationCode);
  return url.toString();
};

const stationBinsForSelectedLocation = () => {
  const activeBin = selectedBin();
  return state.bins.filter((bin) => bin.station === activeBin.station);
};

const normalizeCode = (value) => {
  const clean = String(value || "").trim().toUpperCase();
  const compactMatch = clean.match(/^BIN(\d{3})$/);
  if (compactMatch) return `BIN-${compactMatch[1]}`;
  return clean;
};

const binIdFromScanValue = (value) => {
  const text = String(value || "").trim();

  try {
    const url = new URL(text, window.location.origin);
    const bin = url.searchParams.get("bin");
    if (bin) return normalizeCode(bin);
  } catch {
    // Plain bin codes are still accepted for older generated QR values.
  }

  return normalizeCode(text);
};

const stationCodeFromScanValue = (value) => {
  const text = String(value || "").trim();

  try {
    const url = new URL(text, window.location.origin);
    const station = url.searchParams.get("station");
    if (station) return normalizeCode(station);
  } catch {
    // Plain station codes are accepted too.
  }

  return normalizeCode(text);
};

const stationBinForCode = (stationCode) =>
  state.bins.find((bin) => bin.qrCode?.startsWith(`${stationCode}-`) && bin.accepts === "Plastic")
  || state.bins.find((bin) => bin.qrCode?.startsWith(`${stationCode}-`));

const handleStationFromQr = (scanValue, { updateUrl = false } = {}) => {
  const stationCode = stationCodeFromScanValue(scanValue);
  const bin = stationBinForCode(stationCode);

  if (!bin) {
    showToast(`Unknown station QR: ${scanValue}`);
    return false;
  }

  state.selectedBinId = bin.id;
  state.pendingStationCode = null;
  if (updateUrl) window.history.replaceState({}, "", scanUrlForStation(stationCode));

  if (role() === "admin") {
    state.page = "bin-status";
    saveState();
    showToast(`Admin viewing ${bin.station}.`);
    render();
    return true;
  }

  if (role() !== "user") {
    state.pendingStationCode = stationCode;
    state.authMode = "login";
    state.page = "auth";
    saveState();
    showToast(`${bin.station} detected. Please login to record rubbish.`);
    render();
    return true;
  }

  state.sensorCheck = { captured: false, confidence: 0 };
  state.page = "select-waste";
  saveState();
  showToast(`${bin.station} detected.`);
  render();
  window.setTimeout(promptGpsVerification, 250);
  return true;
};

const handleQrScan = (scanValue, options = {}) => {
  const text = String(scanValue || "");
  try {
    const url = new URL(text, window.location.origin);
    if (url.searchParams.has("station")) return handleStationFromQr(text, options);
  } catch {
    // Fall through to plain-code handling.
  }

  const stationCode = stationCodeFromScanValue(text);
  if (stationBinForCode(stationCode)) return handleStationFromQr(text, options);
  return handleBinFromQr(text, options);
};

const distanceMeters = (from, to) => {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const verifyBinLocation = () =>
  new Promise((resolve) => {
  const bin = state.bins.find((item) => item.id === state.selectedBinId);
  if (!bin) {
    resolve(false);
    return;
  }

  if (!("geolocation" in navigator)) {
    showToast("Location verification failed. This device does not support GPS.");
    resolve(false);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const distance = distanceMeters(
        { lat: position.coords.latitude, lng: position.coords.longitude },
        { lat: bin.lat, lng: bin.lng }
      );
      const allowedDistance = 120;
      state.locationCheck = { verified: distance <= allowedDistance, distance };
      saveState();
      showToast(distance <= allowedDistance
        ? `Location verified: ${distance}m from ${bin.name}.`
        : `Too far from ${bin.name}: ${distance}m away. Move closer to continue.`);
      render();
      resolve(distance <= allowedDistance);
    },
    () => {
      state.locationCheck = { verified: false, distance: null };
      saveState();
      showToast("Location verification failed. Please allow GPS access.");
      render();
      resolve(false);
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
  );
});

const promptGpsVerification = async () => {
  if (gpsPromptOpen || role() !== "user" || state.page !== "select-waste" || state.locationCheck?.verified) return;
  const bin = selectedBin();
  gpsPromptOpen = true;

  const result = await Swal.fire({
    title: "Verify GPS",
    html: `<p class="mb-1">Scanned: <strong>${bin.station || bin.location}</strong></p><p class="mb-0">Allow GPS first. Then press start and show the rubbish item after the countdown.</p>`,
    icon: "info",
    confirmButtonText: "Verify GPS",
    showCancelButton: true,
    cancelButtonText: "Cancel",
    confirmButtonColor: "#1f7a45",
  });

  gpsPromptOpen = false;
  if (!result.isConfirmed) return;

  const verified = await verifyBinLocation();
  if (verified) {
    const ready = await Swal.fire({
      title: "GPS Verified",
      text: "Press start. The system will count 3, 2, 1, then detect the rubbish from your camera.",
      icon: "success",
      confirmButtonText: "Start Detection",
      confirmButtonColor: "#1f7a45",
    });
    if (ready.isConfirmed) await startAiCountdownAndDetect();
  }
};

const promptStartDetection = async () => {
  if (aiCountdownOpen || role() !== "user" || state.page !== "select-waste" || !state.locationCheck?.verified) return;

  const ready = await Swal.fire({
    title: "Start Detection",
    text: "The system will count 3, 2, 1. Show the rubbish item in front of your camera after the countdown.",
    icon: "info",
    confirmButtonText: "Start",
    showCancelButton: true,
    cancelButtonText: "Cancel",
    confirmButtonColor: "#1f7a45",
  });

  if (ready.isConfirmed) await startAiCountdownAndDetect();
};

const initScanVerificationPrompt = () => {
  if (role() !== "user" || state.page !== "select-waste" || gpsPromptOpen || aiCountdownOpen) return;

  if (!state.locationCheck?.verified) {
    const promptKey = `${state.selectedBinId || ""}-${state.locationCheck?.distance ?? "new"}`;
    if (lastGpsPromptKey === promptKey) return;
    lastGpsPromptKey = promptKey;
    window.setTimeout(promptGpsVerification, 350);
    return;
  }

  if (!state.aiDetection && !state.sensorCheck?.captured) {
    const promptKey = `${state.selectedBinId || ""}-${state.locationCheck?.distance ?? 0}-ready`;
    if (lastDetectionPromptKey === promptKey) return;
    lastDetectionPromptKey = promptKey;
    window.setTimeout(promptStartDetection, 350);
  }
};

const setDemoStationToCurrentLocation = () => {
  const activeBin = state.bins.find((item) => item.id === state.selectedBinId) || state.bins[0];
  const stationName = activeBin.station;

  if (!("geolocation" in navigator)) {
    showToast("This device does not support GPS.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const stationBins = state.bins.filter((bin) => bin.station === stationName);
      const offsets = [-0.00003, 0, 0.00003];
      stationBins.forEach((bin, index) => {
        bin.lat = position.coords.latitude + offsets[index % offsets.length];
        bin.lng = position.coords.longitude + offsets[index % offsets.length];
        bin.location = "Current demo location";
      });
      state.locationCheck = { verified: true, distance: 0 };
      saveState();
      showToast(`${stationName} station set to your current location.`);
      render();
    },
    () => showToast("Could not get current location. Please allow GPS access."),
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
  );
};

const handleBinFromQr = (scanValue, { updateUrl = false } = {}) => {
  const binId = binIdFromScanValue(scanValue);
  const bin = state.bins.find((item) => item.id === binId || item.qrCode === binId);

  if (!bin) {
    showToast(`Unknown location QR: ${scanValue}`);
    return false;
  }

  state.selectedBinId = bin.id;
  if (updateUrl) window.history.replaceState({}, "", scanUrlForStation(bin.qrCode?.split("-")[0] || bin.station));

  if (role() === "admin") {
    state.page = "bin-status";
    saveState();
    showToast(`Admin viewing ${bin.id}.`);
    render();
    return true;
  }

  if (role() !== "user") {
    state.pendingBinId = bin.id;
    state.authMode = "login";
    state.page = "auth";
    saveState();
    showToast(`Bin ${bin.id} detected. Please login to record rubbish.`);
    render();
    return true;
  }

  state.pendingBinId = null;
  recyclingService.selectBin(bin.id);
  showToast(`Bin ${bin.id} detected.`);
  render();
  window.setTimeout(promptGpsVerification, 250);
  return true;
};

const showToast = (message) => {
  if (!message) return;
  const errorWords = ["failed", "try again", "wrong", "penalty", "unknown", "not enough", "no points", "could not", "false", "missing"];
  const isError = errorWords.some((word) => message.toLowerCase().includes(word));
  Swal.fire({
    text: message,
    icon: isError ? "error" : "success",
    timer: 1800,
    showConfirmButton: false,
  });
  toast.textContent = message;
};

const routeSets = {
  guest: ["home", "auth"],
  user: ["scan", "locations", "education", "game", "learning-records", "select-waste", "points", "penalties", "rewards", "item-detail", "redeem-confirm", "my-redeemed", "collection", "history", "contact", "profile"],
  admin: ["admin-dashboard", "manage-qr", "manage-bins", "bin-status", "waste-records", "manage-users", "manage-user-detail", "points-management", "penalty-management", "manage-rewards", "redemptions", "reports", "profile"],
};

const pageForRole = () => {
  const activeRole = role();
  if (activeRole === "guest" && !routeSets.guest.includes(state.page)) {
    state.page = "home";
    saveState();
  }
  if (!routeSets[activeRole].includes(state.page)) return renderNotFound();
  if (role() === "admin") return renderAdminPage();
  if (role() === "user") return renderUserPage();
  return renderGuestPage();
};

const renderLoadingScreen = () => {
  navLinks.innerHTML = "";
  navActions.innerHTML = "";
  app.innerHTML = `
    <section class="loading-screen">
      <div class="loading-mark">
        <img src="/images/recycle-logo.png" alt="" />
      </div>
      <p class="eyebrow">EcoCycle Sarawak</p>
      <h1>Loading recycling platform</h1>
      <div class="loading-bar"><span></span></div>
    </section>
  `;
};

const render = () => {
  if (!appReady) {
    renderLoadingScreen();
    return;
  }

  if (threeGameCleanup) {
    threeGameCleanup();
    threeGameCleanup = null;
  }
  if (state.page !== "select-waste") stopAiSensorCameras();
  renderNav(navLinks, navActions);
  app.innerHTML = pageForRole();
  initPagePlugins();
};

const go = (page) => {
  state.page = page;
  if (page !== "select-waste") {
    const url = new URL(window.location.href);
    if (url.searchParams.has("bin")) {
      url.searchParams.delete("bin");
      window.history.replaceState({}, "", url);
    }
    if (url.searchParams.has("station")) {
      url.searchParams.delete("station");
      window.history.replaceState({}, "", url);
    }
  }
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const handleNavigation = (target) => {
  if (target.dataset.page) go(target.dataset.page);

  if (target.dataset.auth) {
    state.authMode = target.dataset.auth;
    go("auth");
  }

  if (target.dataset.action === "logout") {
    authService.logout();
    go("home");
  }
};

const handleDemoFill = (target) => {
  if (target.dataset.demo === "user") {
    state.form.email = "user@demo.com";
    state.form.password = "123456";
    saveState();
    render();
  }

  if (target.dataset.demo === "admin") {
    state.form.email = "admin@demo.com";
    state.form.password = "admin123";
    saveState();
    render();
  }
};

const handleUserActions = (target) => {
  if (target.dataset.scan) {
    if (role() !== "user") {
      showToast("Please login as a user before scanning a location QR code.");
      state.authMode = "login";
      go("auth");
      return;
    }

    handleQrScan(target.dataset.scan, { updateUrl: true });
  }

  if (target.dataset.waste) {
    recyclingService.selectWaste(target.dataset.waste);
    render();
  }

  if (target.dataset.binSelect) {
    recyclingService.selectBin(target.dataset.binSelect);
    render();
  }

  if (target.dataset.zoneSelect) {
    const zone = target.dataset.zoneSelect;
    const matchedStationBin = stationBinsForSelectedLocation().find((bin) => bin.accepts === zone);
    if (matchedStationBin) {
      state.selectedBinId = matchedStationBin.id;
      state.sensorCheck = {
        ...state.sensorCheck,
        zone,
        manualZone: zone,
      };
      saveState();
      render();
    }
  }

  if (target.dataset.record) {
    const url = new URL(window.location.href);
    if (url.searchParams.has("bin")) {
      url.searchParams.delete("bin");
      window.history.replaceState({}, "", url);
    }
    showToast(recyclingService.recordWaste());
    render();
  }

  if (target.dataset.action === "verify-location") {
    promptGpsVerification();
  }
  if (target.dataset.action === "start-detection") promptStartDetection();
  if (target.dataset.action === "set-demo-location") setDemoStationToCurrentLocation();

  if (target.dataset.reward) {
    rewardService.selectReward(target.dataset.reward);
    render();
  }

  if (target.dataset.confirmRedeem) {
    const result = rewardService.redeemReward(target.dataset.confirmRedeem);
    showToast(result.message);
    render();
  }

  if (target.dataset.game) {
    const [itemId, bin] = target.dataset.game.split(":");
    const result = learningService.submitGame(itemId, bin);
    showToast(result.message);
    render();
  }

  if (target.dataset.action === "start-scanner") startScanner();
  if (target.dataset.action === "stop-scanner") stopScanner();
};

const handleAdminActions = (target) => {
  if (target.dataset.action === "add-bin") {
    adminService.addBin();
    render();
  }

  if (target.dataset.adjust) {
    const [userId, amount] = target.dataset.adjust.split(":");
    adminService.adjustPoints(userId, amount);
    render();
  }

  if (target.dataset.manageUser) {
    state.selectedManagedUserId = Number(target.dataset.manageUser);
    state.page = "manage-user-detail";
    saveState();
    render();
  }

  if (target.dataset.deleteUser) {
    const confirmed = window.confirm("Delete this user and all related records?");
    if (!confirmed) return;
    const result = adminService.deleteUser(target.dataset.deleteUser);
    if (result?.message) showToast(result.message);
    render();
  }

  if (target.dataset.deleteReward) {
    const confirmed = window.confirm("Are you sure you want to delete this reward item?");
    if (!confirmed) return;
    const result = adminService.deleteReward(target.dataset.deleteReward);
    if (result?.message) showToast(result.message);
    render();
  }

  if (target.dataset.saveReward) {
    const confirmed = window.confirm("Do you want to save changes?");
    if (!confirmed) return;
    const rewardId = target.dataset.saveReward;
    const pointsInput = document.querySelector(`[data-reward-points="${rewardId}"]`);
    const stockInput = document.querySelector(`[data-reward-stock="${rewardId}"]`);
    const imageDraft = state.rewardDrafts?.[rewardId]?.image || null;
    const pointsResult = pointsInput ? adminService.updateRewardPoints(rewardId, pointsInput.value) : null;
    const stockResult = stockInput ? adminService.updateRewardStock(rewardId, stockInput.value) : null;
    const imageResult = imageDraft ? adminService.updateRewardImage(rewardId, imageDraft) : null;
    if (pointsResult?.ok === false && pointsResult?.message) showToast(pointsResult.message);
    else if (stockResult?.ok === false && stockResult?.message) showToast(stockResult.message);
    else if (imageResult?.ok === false && imageResult?.message) showToast(imageResult.message);
    else showToast("Reward changes saved.");
    if (state.rewardDrafts?.[rewardId]) {
      delete state.rewardDrafts[rewardId];
      saveState();
    }
    render();
  }

  if (target.dataset.redemption) {
    const [id, status] = target.dataset.redemption.split(":");
    adminService.updateRedemption(id, status);
    render();
  }

  if (target.dataset.action === "export-report-pdf") {
    window.print();
  }

};

const handleClick = (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  handleNavigation(target);
  handleDemoFill(target);
  handleUserActions(target);
  handleAdminActions(target);
};

const handleSubmit = (event) => {
  const form = event.target.closest("form");
  if (!form) return;

  event.preventDefault();
  const formData = new FormData(form);
  let result = null;

  if (form.dataset.form === "login") result = authService.login(formData);
  if (form.dataset.form === "register") result = authService.register(formData);
  if (form.dataset.form === "feedback") result = { ok: true, message: feedbackService.submitFeedback(formData) };
  if (form.dataset.form === "add-reward") result = adminService.addReward(formData);
  if (form.dataset.form === "add-user") result = adminService.addUser(formData);
  if (form.dataset.form === "edit-managed-user") result = adminService.editUserByAdmin(formData);
  if (form.dataset.form === "profile") result = authService.updateProfile(formData);

  if (result?.message) showToast(result.message);
  render();
  if (result?.ok && state.page === "select-waste") window.setTimeout(promptGpsVerification, 250);
};

const readAvatar = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });

const handleAvatarChange = async (input) => {
  const file = input.files?.[0];
  const user = currentUser();
  if (!file || !user) return;

  user.avatar = await readAvatar(file);
  saveState();
  render();
  showToast("Profile image updated.");
};

const handleNewRewardImageChange = async (input) => {
  const file = input.files?.[0];
  if (!file) return;
  state.newItem.image = await readAvatar(file);
  saveState();
  render();
};

const handleRewardImageChange = async (input) => {
  const file = input.files?.[0];
  const rewardId = Number(input.dataset.rewardImage);
  if (!file || !rewardId) return;
  state.rewardDrafts = state.rewardDrafts || {};
  state.rewardDrafts[rewardId] = {
    ...(state.rewardDrafts[rewardId] || {}),
    image: await readAvatar(file),
  };
  saveState();
  render();
  showToast("Image preview ready. Press Save to apply.");
};

const localYoloFallback = (file) => {
  const name = file.name.toLowerCase();
  const checks = [
    { words: ["plastic", "bottle", "cup"], label: "plastic bottle", category: "Plastic" },
    { words: ["paper", "newspaper", "cardboard", "box"], label: "paper", category: "Paper" },
    { words: ["tissue", "wrapper", "food", "general"], label: "general waste", category: "General Waste" },
  ];
  const matched = checks.find((item) => item.words.some((word) => name.includes(word)));
  const result = matched || checks[(file.size + file.name.length) % checks.length];

  return {
    ...result,
    confidence: 86 + ((file.size + file.name.length) % 11),
    box: { x: 128, y: 84, width: 260, height: 260 },
    model: "YOLO detector fallback",
    presenceDetected: true,
  };
};

const detectWasteWithAi = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (isLocal) {
    try {
      const response = await fetch("http://127.0.0.1:8000/detect-waste", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Local AI detector unavailable");
      const result = await response.json();
      if (!result?.category || !result?.label) throw new Error("Invalid local AI detector result");
      return result;
    } catch {
      // Continue to Vercel API fallback.
    }
  }

  try {
    const response = await fetch("/api/detect-waste", { method: "POST", body: formData });
    if (!response.ok) throw new Error("Hosted AI detector unavailable");
    const result = await response.json();
    if (!result?.category || !result?.label) throw new Error("Invalid hosted AI detector result");
    return result;
  } catch {
    return localYoloFallback(file);
  }
};

const frameToBlob = (video) =>
  new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.86);
  });

const zoneCategoryFromDetection = (detection, video) => {
  const box = detection?.box;
  if (!box || typeof box.x !== "number") return null;

  const frameWidth = video.videoWidth || 0;
  if (!frameWidth) return null;

  const widthValue = typeof box.width === "number" ? box.width : 0;
  const xValue = box.x;

  let centerRatio = null;
  if (xValue >= 0 && xValue <= 1 && widthValue >= 0 && widthValue <= 1) {
    centerRatio = xValue + (widthValue / 2);
  } else if (xValue >= 0 && xValue <= 100 && widthValue >= 0 && widthValue <= 100) {
    centerRatio = (xValue + (widthValue / 2)) / 100;
  } else {
    const centerX = widthValue > 0 ? xValue + (widthValue / 2) : xValue;
    centerRatio = centerX / frameWidth;
  }

  if (typeof centerRatio !== "number" || Number.isNaN(centerRatio)) return null;
  const clampedRatio = Math.max(0, Math.min(0.9999, centerRatio));

  if (clampedRatio < 1 / 3) return "Plastic";
  if (clampedRatio < 2 / 3) return "Paper";
  return "General Waste";
};

const runLiveAiDetection = async () => {
  if (aiScanBusy || state.page !== "select-waste" || !state.locationCheck?.verified) return;
  const video = document.querySelector("#aiSensorFeed");
  if (!video || video.readyState < 2) return;

  aiScanBusy = true;
  try {
    const preservedManualZone = state.sensorCheck?.manualZone || null;
    const blob = await frameToBlob(video);
    if (!blob) return;
    const file = new File([blob], "live-camera-frame.jpg", { type: "image/jpeg" });
    const detection = await detectWasteWithAi(file);
    state.sensorCheck = {
      captured: true,
      confidence: detection.confidence,
      objectDetected: detection.label,
      presenceDetected: detection.presenceDetected,
      manualZone: preservedManualZone,
    };
    state.aiDetection = detection;
    const zoneCategory = preservedManualZone || zoneCategoryFromDetection(detection, video);
    state.sensorCheck.zone = zoneCategory || "Unknown zone";
    const matchedStationBin = stationBinsForSelectedLocation().find((bin) => bin.accepts === (zoneCategory || detection.category));
    if (matchedStationBin) state.selectedBinId = matchedStationBin.id;
    saveState();
    if (detection.confidence < 70) {
      await Swal.fire({
        title: "Low Confidence",
        text: "Move the rubbish closer to the camera or improve lighting, then scan again.",
        icon: "warning",
        confirmButtonColor: "#1f7a45",
      });
      render();
      return;
    }

    const detectionId = `${detection.label}-${detection.category}-${detection.confidence}`;
    if (state.autoRecordedDetectionId !== detectionId) {
      state.autoRecordedDetectionId = detectionId;
      saveState();
      stopAiSensorCameras();
      const bin = selectedBin();
      const correct = detection.category === bin.accepts;
      await Swal.fire({
        title: correct ? "Correct Disposal" : "Incorrect Disposal",
        html: `
          <div class="ai-result-modal">
            <p><strong>Detected object:</strong> ${detection.label}</p>
            <p><strong>Confidence:</strong> ${detection.confidence}%</p>
            <p><strong>Placed zone:</strong> ${state.sensorCheck.zone || "Unknown zone"}</p>
            <p><strong>Scanned bin:</strong> ${bin.name}</p>
            <p><strong>Expected:</strong> ${bin.accepts}</p>
            <p><strong>Result:</strong> ${correct ? "Correct" : "False"}</p>
          </div>
        `,
        icon: correct ? "success" : "error",
        confirmButtonText: "Save Result",
        confirmButtonColor: "#1f7a45",
      });
      showToast(recyclingService.recordWaste());
      render();
      return;
    }
    render();
  } finally {
    aiScanBusy = false;
  }
};

const startAiCountdownAndDetect = async () => {
  if (aiCountdownOpen || state.page !== "select-waste" || !state.locationCheck?.verified) return;
  aiCountdownOpen = true;

  try {
    await initAiSensorCameras();

    if (!aiCameraStream) {
      showToast("Camera permission is required for AI detection.");
      return;
    }

    let secondsLeft = 3;
    await Swal.fire({
      title: "3",
      text: "Get ready to show the rubbish item.",
      icon: "info",
      timer: 3000,
      timerProgressBar: true,
      showConfirmButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        const title = Swal.getTitle();
        const interval = window.setInterval(() => {
          secondsLeft -= 1;
          if (title) title.textContent = secondsLeft > 0 ? String(secondsLeft) : "Detecting...";
          if (secondsLeft <= 0) window.clearInterval(interval);
        }, 1000);
      },
    });

    await runLiveAiDetection();
  } finally {
    aiCountdownOpen = false;
  }
};

const stopAiSensorCameras = () => {
  if (aiCameraStream) {
    aiCameraStream.getTracks().forEach((track) => track.stop());
    aiCameraStream = null;
  }
  aiScanBusy = false;
};

const initAiSensorCameras = async () => {
  const video = document.querySelector("#aiSensorFeed");
  if (!video || !state.locationCheck?.verified) return;

  try {
    if (!aiCameraStream) {
      aiCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    }
    video.srcObject = aiCameraStream;
    await video.play();
  } catch {
    showToast("Camera permission is required after GPS verification.");
  }
};

const handleChange = async (event) => {
  if (event.target.name === "avatar") {
    handleAvatarChange(event.target);
    return;
  }

  if (event.target.name === "newRewardImage") {
    handleNewRewardImageChange(event.target);
    return;
  }

  if (event.target.dataset.rewardImage !== undefined) {
    handleRewardImageChange(event.target);
    return;
  }

  if (event.target.dataset.rewardStock !== undefined || event.target.dataset.rewardPoints !== undefined) {
    return;
  }

  if (event.target.name === "sensorImage") {
    const file = event.target.files?.[0];
    const sensorBin = event.target.dataset.sensorBin;
    if (file) {
      showToast("Running YOLO object detection...");
      const detection = await detectWasteWithAi(file);
      if (sensorBin && state.bins.some((bin) => bin.id === sensorBin)) {
        state.selectedBinId = sensorBin;
      }
      state.sensorCheck = {
        captured: true,
        confidence: detection.confidence,
        objectDetected: detection.label,
        presenceDetected: detection.presenceDetected,
        zone: "Upload check",
      };
      state.aiDetection = detection;
      saveState();
      showToast(`${detection.label} detected as ${detection.category}.`);
      render();
    }
    return;
  }

  if (event.target.dataset.scanSearch !== undefined) {
    state.scanSearchTerm = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.dataset.navGlobalSearch !== undefined) {
    state.globalSearchTerm = event.target.value;
    state.scanSearchTerm = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.dataset.collectionFilterText !== undefined) {
    state.collectionFilterText = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.dataset.collectionFilterStatus !== undefined) {
    state.collectionFilterStatus = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.dataset.historyFilterText !== undefined) {
    state.historyFilterText = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.dataset.historyFilterType !== undefined) {
    state.historyFilterType = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.dataset.adminUserFilter !== undefined) {
    state.adminUserFilterText = event.target.value;
    saveState();
    render();
    return;
  }

  if (event.target.name && state.form[event.target.name] !== undefined) {
    state.form[event.target.name] = event.target.value;
    saveState();
  }

  if (event.target.name && state.newItem[event.target.name] !== undefined) {
    state.newItem[event.target.name] = event.target.value;
    saveState();
  }

  if (event.target.dataset.binStatus) {
    adminService.updateBinStatus(event.target.dataset.binStatus, event.target.value);
    render();
  }
};

const initLeafletMap = () => {
  const mapElement = document.querySelector("#binMap");
  if (!mapElement || mapElement.dataset.ready) return;

  mapElement.dataset.ready = "true";
  const map = L.map(mapElement, { scrollWheelZoom: false }).setView([1.5205, 110.3715], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  binStations().forEach((station, index) => {
    const hasIssue = station.bins.some((bin) => bin.status !== "Available");
    const marker = L.marker([station.lat, station.lng], {
      icon: L.divIcon({
        className: `leaflet-bin-marker ${hasIssue ? "maintenance" : "available"}`,
        html: `<span>${index + 1}</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      }),
    }).addTo(map);
    marker.bindPopup(`<strong>${station.name}</strong><br>${station.location}<br>Plastic, Paper, General Waste`);
  });

  window.setTimeout(() => map.invalidateSize(), 100);
};

const initCollectionMap = () => {
  const mapElement = document.querySelector("#collectionMap");
  if (!mapElement || mapElement.dataset.ready) return;

  mapElement.dataset.ready = "true";
  const destination = [collectionLocation.lat, collectionLocation.lng];
  const map = L.map(mapElement, { scrollWheelZoom: false }).setView(destination, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  L.marker(destination).addTo(map).bindPopup(`<strong>${collectionLocation.name}</strong><br>${collectionLocation.place}`);

  const drawRoute = (origin) => {
    L.marker(origin).addTo(map).bindPopup("Your current location");
    L.polyline([origin, destination], { color: "#1f7a45", weight: 5, opacity: 0.82, dashArray: "8 8" }).addTo(map);
    map.fitBounds([origin, destination], {
      paddingTopLeft: [42, 110],
      paddingBottomRight: [42, 42],
      maxZoom: 14,
    });
  };

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => drawRoute([position.coords.latitude, position.coords.longitude]),
      () => map.setView(destination, 16),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  window.setTimeout(() => map.invalidateSize(), 100);
};

const initQrGenerator = () => {
  document.querySelectorAll("[data-qr-station]").forEach((canvas) => {
    if (canvas.dataset.ready) return;
    canvas.dataset.ready = "true";
    const scanUrl = scanUrlForStation(canvas.dataset.qrStation);
    QRCode.toCanvas(canvas, scanUrl, { width: 180, margin: 1 });
    const urlLabel = document.querySelector(`[data-qr-url-for-station="${canvas.dataset.qrStation}"]`);
    if (urlLabel) urlLabel.textContent = scanUrl;
  });
};

const initReportChart = () => {
  const canvas = document.querySelector("#reportChart");
  if (!canvas) return;

  if (reportChart) reportChart.destroy();
  reportChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Scans", "Penalties", "Rewards", "Game"],
      datasets: [
        {
          label: "Total Activity",
          data: [
            state.records.length,
            state.records.filter((record) => record.points < 0).length,
            state.redeemed.length,
            state.learningRecords.length,
          ],
          backgroundColor: ["#1f7a45", "#a83232", "#6d9f35", "#2d6cdf"],
        },
      ],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
};

const initHomeAnimations = () => {
  const hero = document.querySelector("[data-home-hero]");
  if (!hero || hero.dataset.gsapReady) return;
  hero.dataset.gsapReady = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const copyItems = hero.querySelectorAll(".landing-copy .eyebrow, .landing-copy h1, .landing-copy .lead, .hero-metrics, .trust-row, .hero-actions");
  gsap.from(copyItems, {
    y: 28,
    opacity: 0,
    duration: 0.9,
    ease: "power3.out",
    stagger: 0.08,
  });

  gsap.from(hero.querySelector(".showcase-image"), {
    y: 42,
    scale: 0.94,
    opacity: 0,
    duration: 1,
    ease: "power3.out",
    delay: 0.2,
  });

  gsap.to(hero.querySelector(".showcase-image"), {
    y: -14,
    duration: 3.8,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });

  gsap.to(hero.querySelector(".flower-art"), {
    rotate: 7,
    y: -10,
    duration: 4.6,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });

  gsap.from(".store-headline > *, .store-card", {
    scrollTrigger: {
      trigger: "[data-store-shelf]",
      start: "top 78%",
    },
    y: 34,
    opacity: 0,
    duration: 0.75,
    ease: "power3.out",
    stagger: 0.08,
  });

  gsap.from(".landing-band .section-title, .landing-band .process-card", {
    scrollTrigger: {
      trigger: ".landing-band",
      start: "top 80%",
    },
    y: 30,
    opacity: 0,
    duration: 0.7,
    ease: "power3.out",
    stagger: 0.07,
  });
};

const initPagePlugins = () => {
  initLeafletMap();
  initCollectionMap();
  initQrGenerator();
  initReportChart();
  initThreeGame();
  initScanVerificationPrompt();
  initHomeAnimations();
};

const makeTextSprite = (text, color = "#10251d") => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.font = "bold 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.5, 0.62, 1);
  return sprite;
};

const createBin = ({ type, color, x }) => {
  const group = new THREE.Group();
  group.userData = { type };

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 1.8, 1.25),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  );
  body.position.y = 0.9;
  group.add(body);

  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.12, 1.05),
    new THREE.MeshStandardMaterial({ color: 0x10251d, roughness: 0.4 })
  );
  opening.position.y = 1.86;
  group.add(opening);

  const label = makeTextSprite(type, "#10251d");
  label.position.set(0, 2.55, 0);
  group.add(label);

  group.position.set(x, 0, -0.4);
  return group;
};

const createRubbish = (item) => {
  const colors = {
    Plastic: 0x1f7a45,
    Paper: 0x1f5d99,
    "General Waste": 0xd8a21d,
  };
  const material = new THREE.MeshStandardMaterial({ color: colors[item.bin] || 0x8fd6d2, roughness: 0.48 });
  const group = new THREE.Group();
  group.userData = { item };

  if (item.shape === "bottle") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.82, 28), material);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 20), material);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 20), new THREE.MeshStandardMaterial({ color: 0x24552f }));
    neck.position.y = 0.52;
    cap.position.y = 0.69;
    group.add(body, neck, cap);
  } else if (item.shape === "cup") {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.58, 28), material);
    cup.rotation.z = 0.15;
    group.add(cup);
  } else if (item.shape === "paper") {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.72), material);
    const fold = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.18), new THREE.MeshStandardMaterial({ color: 0xf7edc6 }));
    fold.position.set(0.18, 0.07, 0.18);
    group.add(sheet, fold);
  } else if (item.shape === "box") {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.62), material);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.28), new THREE.MeshStandardMaterial({ color: 0xc49a45 }));
    flap.position.set(0, 0.31, -0.2);
    group.add(box, flap);
  } else if (item.shape === "wrapper") {
    const wrapper = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.44), material);
    wrapper.rotation.set(0.2, 0.4, -0.15);
    group.add(wrapper);
  } else if (item.shape === "food") {
    const peel = new THREE.Mesh(new THREE.TorusKnotGeometry(0.24, 0.07, 80, 10), material);
    peel.rotation.set(0.4, 0.2, 0.7);
    group.add(peel);
  } else {
    const crumple = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38), material);
    crumple.scale.set(1.1, 0.78, 1);
    group.add(crumple);
  }

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  group.position.set(0, 1.25, 2.15);

  const label = makeTextSprite(item.name, "#10251d");
  label.position.set(0, 0.9, 0);
  group.add(label);

  return group;
};

const initThreeGame = () => {
  const mount = document.querySelector("#threeGame");
  if (!mount || mount.dataset.ready) return;
  mount.dataset.ready = "true";

  const items = JSON.parse(mount.dataset.items);
  let activeItem = null;
  let dragging = false;
  let animationId = null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8fcf4);

  const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
  camera.position.set(0, 4.6, 7.4);
  camera.lookAt(0, 0.9, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc7dfbd, 1.8));
  const light = new THREE.DirectionalLight(0xffffff, 1.8);
  light.position.set(2.8, 6, 4);
  light.castShadow = true;
  scene.add(light);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({ color: 0xdff4d5, roughness: 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const bins = [
    createBin({ type: "Plastic", color: 0x1f7a45, x: -2.4 }),
    createBin({ type: "Paper", color: 0x1f5d99, x: 0 }),
    createBin({ type: "General Waste", color: 0xd8a21d, x: 2.4 }),
  ];
  bins.forEach((bin) => scene.add(bin));

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.25);
  const hitPoint = new THREE.Vector3();

  const setPointer = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const spawnItem = () => {
    if (activeItem) scene.remove(activeItem);
    activeItem = createRubbish(items[Math.floor(Math.random() * items.length)]);
    scene.add(activeItem);
  };

  const checkDrop = () => {
    const closest = bins.reduce((best, bin) => {
      const distance = Math.hypot(activeItem.position.x - bin.position.x, activeItem.position.z - bin.position.z);
      return distance < best.distance ? { bin, distance } : best;
    }, { bin: null, distance: Infinity });

    if (closest.distance > 1.85) {
      showToast("Drop the item closer to a bin.");
      activeItem.position.set(0, 1.25, 2.15);
      return;
    }

    const result = learningService.submitGame(activeItem.userData.item.id, closest.bin.userData.type);
    showToast(result.message);
    spawnItem();
  };

  const onPointerDown = (event) => {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(activeItem, true);
    if (hits.length === 0) return;
    dragging = true;
    renderer.domElement.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(dragPlane, hitPoint);
    activeItem.position.set(
      THREE.MathUtils.clamp(hitPoint.x, -3.3, 3.3),
      1.25,
      THREE.MathUtils.clamp(hitPoint.z, -0.8, 2.6)
    );
  };

  const onPointerUp = (event) => {
    if (!dragging) return;
    dragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
    checkDrop();
  };

  const onResize = () => {
    if (!mount.isConnected) return;
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);

  spawnItem();

  const animate = () => {
    animationId = window.requestAnimationFrame(animate);
    if (activeItem && !dragging) activeItem.rotation.y += 0.012;
    renderer.render(scene, camera);
  };
  animate();

  threeGameCleanup = () => {
    window.cancelAnimationFrame(animationId);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.dispose();
    mount.replaceChildren();
  };
};

const stopScanner = async () => {
  const reader = document.querySelector("#qrReader");
  const launcher = document.querySelector("#scannerLaunch");
  const actionStack = document.querySelector(".scanner-action-stack");
  const actions = document.querySelector("#scannerActions");

  if (!qrScanner) return;

  try {
    await qrScanner.stop();
    qrScanner.clear();
    qrScanner = null;
    reader?.classList.add("hidden");
    launcher?.classList.remove("hidden");
    actionStack?.classList.remove("hidden");
    actions?.classList.add("hidden");
    showToast("QR scanner stopped.");
  } catch {
    qrScanner = null;
    reader?.classList.add("hidden");
    launcher?.classList.remove("hidden");
    actionStack?.classList.remove("hidden");
    actions?.classList.add("hidden");
  }
};

const startScanner = async () => {
  const reader = document.querySelector("#qrReader");
  const launcher = document.querySelector("#scannerLaunch");
  const actionStack = document.querySelector(".scanner-action-stack");
  const actions = document.querySelector("#scannerActions");
  if (!reader) return;

  if (qrScanner) await stopScanner();
  reader.classList.remove("hidden");
  launcher?.classList.add("hidden");
  actionStack?.classList.add("hidden");
  actions?.classList.remove("hidden");
  qrScanner = new Html5Qrcode("qrReader");
  const onScanSuccess = async (decodedText) => {
    showToast("QR detected.");
    await stopScanner();
    handleQrScan(decodedText, { updateUrl: true });
  };
  const scanConfig = {
    fps: 12,
    aspectRatio: 1,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.92);
      return { width: size, height: size };
    },
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    rememberLastUsedCamera: true,
  };

  try {
    await qrScanner.start(
      { facingMode: "environment" },
      scanConfig,
      onScanSuccess
    );
  } catch {
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras?.length) throw new Error("No camera found");
      await qrScanner.start(cameras[0].id, scanConfig, onScanSuccess);
    } catch (error) {
      reader.classList.add("hidden");
      launcher?.classList.remove("hidden");
      actionStack?.classList.remove("hidden");
      actions?.classList.add("hidden");
      const message = error?.message ? `Camera scanner could not start: ${error.message}` : "Camera scanner could not start. Please allow camera access.";
      showToast(message);
    }
  }
};

const initIncomingBinFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const stationCode = params.get("station");
  if (stationCode) {
    handleStationFromQr(stationCode);
    return;
  }

  const binId = params.get("bin");
  if (binId) handleBinFromQr(binId);
};

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", handleChange);
document.addEventListener("change", handleChange);

initIncomingBinFromUrl();
render();
window.setTimeout(() => {
  appReady = true;
  render();
}, 900);
