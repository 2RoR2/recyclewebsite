import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "leaflet/dist/leaflet.css";
import "./index.css";
import "./responsive.css";
import { Chart } from "chart.js/auto";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import L from "leaflet";
import QRCode from "qrcode";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import * as THREE from "three";
import { collectionLocation, initializeDatabase, saveState, state } from "./backend/database.js";
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
let autoLocationBusy = false;
let aiCountdownOpen = false;
let lastGpsPromptKey = "";
let appReady = false;
let deferredInstallPrompt = null;
let waitingServiceWorker = null;
let pageMotionCleanups = [];
let smoothScrollReady = false;

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
  state.bins.find((bin) => bin.qrCode?.startsWith(`${stationCode}-`) && bin.accepts === "Paper")
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
  window.setTimeout(autoVerifyCurrentLocationAfterScan, 250);
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

const applyCurrentLocationToSelectedStation = () =>
  new Promise((resolve) => {
    const activeBin = selectedBin();
    const stationName = activeBin.station;

    if (!("geolocation" in navigator)) {
      showToast("This device does not support GPS.");
      resolve(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const stationBins = state.bins.filter((bin) => bin.station === stationName);
        const fallbackBins = stationBins.length ? stationBins : [activeBin];
        const offsets = [-0.00003, 0, 0.00003];
        fallbackBins.forEach((bin, index) => {
          bin.lat = position.coords.latitude + offsets[index % offsets.length];
          bin.lng = position.coords.longitude + offsets[index % offsets.length];
          bin.location = "Current GPS location";
        });
        state.locationCheck = {
          verified: true,
          distance: 0,
          autoDetected: true,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        saveState();
        showToast(`Current location detected for ${stationName}.`);
        render();
        resolve(true);
      },
      () => {
        state.locationCheck = { verified: false, distance: null };
        saveState();
        showToast("Could not auto-detect current location. Please allow GPS access.");
        render();
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
    );
  });

const autoVerifyCurrentLocationAfterScan = async () => {
  if (autoLocationBusy || role() !== "user" || state.page !== "select-waste" || state.locationCheck?.verified) return;
  autoLocationBusy = true;
  const verified = await applyCurrentLocationToSelectedStation();
  autoLocationBusy = false;
  if (verified) return;
  window.setTimeout(promptGpsVerification, 350);
};

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
    confirmButtonColor: "#0b0b0d",
  });

  gpsPromptOpen = false;
  if (!result.isConfirmed) return;

  await verifyBinLocation();
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
    confirmButtonColor: "#0b0b0d",
  });

  if (ready.isConfirmed) await startAiCountdownAndDetect();
};

const initScanVerificationPrompt = () => {
  if (role() !== "user" || state.page !== "select-waste" || gpsPromptOpen || aiCountdownOpen) return;

  if (!state.locationCheck?.verified) {
    const promptKey = `${state.selectedBinId || ""}-${state.locationCheck?.distance ?? "new"}`;
    if (lastGpsPromptKey === promptKey) return;
    lastGpsPromptKey = promptKey;
    window.setTimeout(autoVerifyCurrentLocationAfterScan, 350);
    return;
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
  window.setTimeout(autoVerifyCurrentLocationAfterScan, 250);
  return true;
};

const showToast = (message) => {
  if (!message) return;
  const errorWords = ["failed", "try again", "wrong", "unknown", "not enough", "no points", "could not", "false", "missing"];
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
  guest: ["home", "news", "auth", "support", "recycle-guide"],
  user: ["scan", "locations", "maps", "education", "game", "learning-records", "select-waste", "points", "rewards", "item-detail", "redeem-confirm", "my-redeemed", "collection", "history", "contact", "profile"],
  admin: ["admin-dashboard", "manage-qr", "manage-bins", "bin-status", "waste-records", "manage-users", "manage-user-detail", "points-management", "manage-rewards", "redemptions", "reports", "profile"],
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

const cleanupPageMotion = () => {
  pageMotionCleanups.forEach((cleanup) => cleanup());
  pageMotionCleanups = [];
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
};

const renderLoadingScreen = () => {
  document.body.dataset.role = "loading";
  document.body.dataset.page = "loading";
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
  cleanupPageMotion();
  renderNav(navLinks, navActions);
  document.body.dataset.role = role();
  document.body.dataset.page = state.page;
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

const handleNavigation = async (target) => {
  if (target.dataset.anchor) {
    const anchor = target.dataset.anchor;
    if (anchor === "home") {
      if (role() === "guest") go("home");
      else go(role() === "admin" ? "admin-dashboard" : "scan");
      return;
    }
    const section = document.querySelector(`#${anchor}`);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (role() === "guest") {
      go("home");
      window.setTimeout(() => document.querySelector(`#${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      return;
    }
    if (anchor === "contact" && routeSets[role()]?.includes("contact")) go("contact");
  }

  if (target.dataset.page) go(target.dataset.page);

  if (target.dataset.auth) {
    state.authMode = target.dataset.auth;
    go("auth");
  }

  if (target.dataset.action === "logout") {
    authService.logout();
    go("home");
  }

  if (target.dataset.action === "install-pwa") {
    showInstallPrompt();
  }

  if (target.dataset.action === "back-to-top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (target.dataset.action === "delete-profile") {
    const confirmed = await Swal.fire({
      title: "Delete account?",
      text: "This removes your profile, recycling records, learning records, and redeemed item history from this app.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete Account",
      cancelButtonText: "Keep Account",
      confirmButtonColor: "#d71920",
      cancelButtonColor: "#0f5a20",
    });

    if (!confirmed.isConfirmed) return;
    const result = authService.deleteCurrentAccount();
    if (result?.message) showToast(result.message);
    render();
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
      document.querySelectorAll(".ai-zone").forEach((button) => {
        button.classList.toggle("active", button.dataset.zoneSelect === zone);
      });
      const zoneLabel = document.querySelector("[data-active-zone-label]");
      if (zoneLabel) zoneLabel.textContent = zone;
      document.querySelector(".ai-zone-wrapper")?.classList.add("has-selected-zone");
      initAiSensorCameras();
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

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const hasStrongPasswordParts = (value) =>
  /[a-z]/.test(value)
  && /[A-Z]/.test(value)
  && /\d/.test(value)
  && /[^A-Za-z0-9]/.test(value);

const validationErrorForForm = (form, formData) => {
  const formType = form.dataset.form;
  const email = formData.get("email")?.trim() || "";
  const password = formData.get("password") || "";

  if (formType === "register") {
    const name = formData.get("name")?.trim() || "";
    if (!name) return "Unable to submit. Please enter your name.";
    if (name.length < 2) return "Unable to submit. Please enter your name.";
    if (!email) return "Unable to submit. Please enter a valid email address.";
    if (!isValidEmail(email)) return "Unable to submit. Please enter a valid email address.";
    if (!password || password.length < 8) return "Unable to submit. Password must contain at least 8 characters.";
    if (!hasStrongPasswordParts(password)) return "Unable to submit. Password must include uppercase, lowercase, number, and symbol.";
  }

  if (formType === "login") {
    if (!email || !isValidEmail(email)) return "Unable to submit. Please enter a valid email address.";
    if (!password) return "Unable to submit. Please complete all required fields.";
  }

  const requiredFields = [...form.querySelectorAll("[required]")];
  const hasMissingRequired = requiredFields.some((field) => {
    if (field.type === "checkbox" || field.type === "radio") return !field.checked;
    return !String(field.value || "").trim();
  });

  if (hasMissingRequired) return "Unable to submit. Please complete all required fields.";
  return "";
};

const handleSubmit = (event) => {
  const form = event.target.closest("form");
  if (!form) return;

  event.preventDefault();
  const formData = new FormData(form);
  const validationMessage = validationErrorForForm(form, formData);
  if (validationMessage) {
    showToast(validationMessage);
    return;
  }

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
  if (result?.ok && state.page === "select-waste") window.setTimeout(autoVerifyCurrentLocationAfterScan, 250);
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
    { words: ["paper", "newspaper", "cardboard", "box"], label: "paper", category: "Paper" },
    { words: ["plastic", "bottle", "cup"], label: "plastic bottle", category: "Plastic" },
    { words: ["aluminium", "aluminum", "can", "tin", "soda"], label: "aluminium", category: "Aluminium" },
    { words: ["wrapper", "tissue", "food", "rubbish", "trash", "dirty"], label: "general waste", category: "General Waste" },
  ];
  const matched = checks.find((item) => item.words.some((word) => name.includes(word)));
  const result = matched || checks[(file.size + file.name.length) % checks.length];

  return {
    ...result,
    confidence: 45,
    box: { x: 128, y: 84, width: 260, height: 260 },
    model: "YOLO detector fallback",
    presenceDetected: false,
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

const aiZoneOrder = ["Paper", "Plastic", "Aluminium", "General Waste"];

const frameToBlob = (video, selectedZone = null) =>
  new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const frameWidth = video.videoWidth || 640;
    const frameHeight = video.videoHeight || 480;
    const zoneIndex = aiZoneOrder.indexOf(selectedZone);
    const zoneWidth = frameWidth / aiZoneOrder.length;
    const sourceX = zoneIndex >= 0 ? Math.round(zoneIndex * zoneWidth) : 0;
    const sourceWidth = zoneIndex >= 0 ? Math.round(zoneWidth) : frameWidth;

    canvas.width = sourceWidth;
    canvas.height = frameHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, sourceX, 0, sourceWidth, frameHeight, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.86);
  });

const collectAiTrainingSample = async ({ blob, zoneCategory, detection, correct }) => {
  if (!blob || !zoneCategory || !detection) return;

  const formData = new FormData();
  formData.append("image", blob, `sample-${zoneCategory.toLowerCase().replaceAll(" ", "-")}.jpg`);
  formData.append("category", zoneCategory);
  formData.append("detected_category", detection.category || "");
  formData.append("confidence", String(detection.confidence || 0));
  formData.append("station", selectedBin().station || "");
  formData.append("zone", zoneCategory);
  formData.append("use_for_training", String(correct && detection.confidence >= 80));

  try {
    await fetch("http://127.0.0.1:8000/collect-sample", { method: "POST", body: formData });
  } catch {
    // Sample collection is optional and only runs when the local AI service is available.
  }
};

const runLiveAiDetection = async () => {
  if (aiScanBusy || state.page !== "select-waste" || !state.locationCheck?.verified) return;
  const video = document.querySelector("#aiSensorFeed");
  if (!video || video.readyState < 2) return;

  aiScanBusy = true;
  try {
    const preservedManualZone = state.sensorCheck?.manualZone || null;
    if (!preservedManualZone) {
      await Swal.fire({
        title: "Select Zone First",
        text: "Only the selected bin zone works as the sensor area.",
        icon: "info",
        confirmButtonColor: "#0b0b0d",
      });
      return;
    }

    const blob = await frameToBlob(video, preservedManualZone);
    if (!blob) return;
    const file = new File([blob], `live-camera-${preservedManualZone.toLowerCase().replaceAll(" ", "-")}-zone.jpg`, { type: "image/jpeg" });
    const detection = await detectWasteWithAi(file);
    state.sensorCheck = {
      captured: true,
      confidence: detection.confidence,
      objectDetected: detection.label,
      presenceDetected: detection.presenceDetected,
      manualZone: preservedManualZone,
    };
    state.aiDetection = detection;
    const zoneCategory = preservedManualZone;
    state.sensorCheck.zone = zoneCategory || "Unknown zone";
    const matchedStationBin = zoneCategory
      ? stationBinsForSelectedLocation().find((bin) => bin.accepts === zoneCategory)
      : null;
    if (matchedStationBin) state.selectedBinId = matchedStationBin.id;
    saveState();
    if (detection.confidence < 70) {
      await Swal.fire({
        title: "Low Confidence",
        text: "Move the rubbish closer to the camera or improve lighting, then scan again.",
        icon: "warning",
        confirmButtonColor: "#0b0b0d",
      });
      render();
      return;
    }

    if (!zoneCategory || !matchedStationBin) {
      await Swal.fire({
        title: "Zone Not Clear",
        text: "Place the rubbish fully inside one bin zone, then scan again.",
        icon: "warning",
        confirmButtonColor: "#0b0b0d",
      });
      render();
      return;
    }

    const detectionId = `${detection.label}-${detection.category}-${zoneCategory}-${detection.confidence}`;
    if (state.autoRecordedDetectionId !== detectionId) {
      state.autoRecordedDetectionId = detectionId;
      saveState();
      stopAiSensorCameras();
      const correct = detection.category === zoneCategory;
      collectAiTrainingSample({ blob, zoneCategory, detection, correct });
      await Swal.fire({
        title: correct ? "Correct Disposal" : "Incorrect Disposal",
        html: `
          <div class="ai-result-modal">
            <p><strong>Detected object:</strong> ${detection.label}</p>
            <p><strong>Detected category:</strong> ${detection.category}</p>
            <p><strong>Confidence:</strong> ${detection.confidence}%</p>
            <p><strong>Placed zone:</strong> ${zoneCategory}</p>
            <p><strong>Zone bin:</strong> ${matchedStationBin.name}</p>
            <p><strong>Expected for zone:</strong> ${zoneCategory}</p>
            <p><strong>Result:</strong> ${correct ? "Correct" : "False"}</p>
          </div>
        `,
        icon: correct ? "success" : "error",
        confirmButtonText: "Save Result",
        confirmButtonColor: "#0b0b0d",
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
  if (!state.sensorCheck?.manualZone) {
    await Swal.fire({
      title: "Select Zone First",
      text: "Tap the bin zone where you placed the rubbish, then start detection.",
      icon: "info",
      confirmButtonColor: "#0b0b0d",
    });
    return;
  }

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
  const stations = binStations().filter((station) =>
    Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lng))
  );
  const map = L.map(mapElement, { scrollWheelZoom: false }).setView([1.5008, 110.3826], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const markerByStationCode = new Map();
  const stationButtons = [...document.querySelectorAll("[data-map-station]")];
  let activeMarker = null;

  const stationIcon = (station, index, active = false) => {
    const hasIssue = station.bins.some((bin) => bin.status !== "Available");
    const size = active ? 56 : 38;
    return L.divIcon({
      className: `leaflet-bin-marker ${hasIssue ? "maintenance" : "available"} ${active ? "selected" : ""}`,
      html: `<span>${index + 1}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
    });
  };

  const selectStation = (stationCode, { moveMap = true } = {}) => {
    const selected = markerByStationCode.get(stationCode);
    if (!selected) return;

    if (activeMarker && activeMarker !== selected.marker) {
      activeMarker.setIcon(stationIcon(activeMarker.ecoStation, activeMarker.ecoIndex));
      activeMarker.setZIndexOffset(0);
    }

    selected.marker.setIcon(stationIcon(selected.station, selected.index, true));
    selected.marker.setZIndexOffset(1000);
    selected.marker.openPopup();
    activeMarker = selected.marker;

    stationButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mapStation === stationCode);
    });

    if (moveMap) {
      map.flyTo([selected.station.lat, selected.station.lng], Math.max(map.getZoom(), 14), {
        animate: true,
        duration: 0.75,
      });
    }
  };

  stations.forEach((station, index) => {
    const marker = L.marker([station.lat, station.lng], {
      icon: stationIcon(station, index),
    }).addTo(map);
    marker.ecoStation = station;
    marker.ecoIndex = index;
    marker.bindPopup(`<strong>${station.name}</strong><br>${station.location}<br>${Number(station.lat).toFixed(4)}, ${Number(station.lng).toFixed(4)}<br>Paper, Plastic, Aluminium, General Waste`);
    marker.on("click", () => selectStation(station.code, { moveMap: false }));
    markerByStationCode.set(station.code, { marker, station, index });
  });

  stationButtons.forEach((button) => {
    button.addEventListener("click", () => selectStation(button.dataset.mapStation));
  });

  const fitStationPins = () => {
    map.invalidateSize();
    if (stations.length > 1) {
      map.fitBounds(stations.map((station) => [station.lat, station.lng]), {
        padding: [42, 42],
        maxZoom: 13,
      });
    }
  };

  window.setTimeout(fitStationPins, 120);
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
    L.polyline([origin, destination], { color: "#d71920", weight: 5, opacity: 0.82, dashArray: "8 8" }).addTo(map);
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
      labels: ["Scans", "Valid Records", "Rewards", "Game"],
      datasets: [
        {
          label: "Total Activity",
          data: [
            state.records.length,
            state.records.filter((record) => record.points > 0).length,
            state.redeemed.length,
            state.learningRecords.length,
          ],
          backgroundColor: ["#ffd84d", "#1f9d55", "#0b0b0d", "#ffffff"],
          borderColor: ["#0b0b0d", "#0b0b0d", "#0b0b0d", "#0b0b0d"],
          borderWidth: 1,
        },
      ],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
};

const splitTextLikeSplitType = (element) => {
  if (!element || element.dataset.splitReady) return [];
  const text = element.textContent.trim();
  if (!text) return [];

  const words = text.split(/\s+/);
  element.dataset.splitReady = "true";
  element.setAttribute("aria-label", text);
  element.textContent = "";

  words.forEach((word, wordIndex) => {
    const wordSpan = document.createElement("span");
    wordSpan.className = "split-word";
    wordSpan.setAttribute("aria-hidden", "true");

    word.split("").forEach((letter) => {
      const letterSpan = document.createElement("span");
      letterSpan.className = "split-char";
      letterSpan.textContent = letter;
      wordSpan.appendChild(letterSpan);
    });

    element.appendChild(wordSpan);
    if (wordIndex < words.length - 1) element.append(" ");
  });

  return Array.from(element.querySelectorAll(".split-char"));
};

const createUseScroll = () => {
  const subscribers = new Set();
  let frame = 0;

  const measure = () => {
    frame = 0;
    const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const progress = Math.min(window.scrollY / maxScroll, 1);
    subscribers.forEach((subscriber) => subscriber(progress, window.scrollY));
  };

  const onScroll = () => {
    if (!frame) frame = window.requestAnimationFrame(measure);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  measure();

  return {
    subscribe(callback) {
      subscribers.add(callback);
      callback(0, window.scrollY);
      return () => subscribers.delete(callback);
    },
    destroy() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      subscribers.clear();
    },
  };
};

const observeInView = (elements, callback, options = {}) => {
  if (!elements.length || !("IntersectionObserver" in window)) return () => {};

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => callback(entry.target, entry.isIntersecting, entry));
  }, {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.22,
    ...options,
  });

  elements.forEach((element) => observer.observe(element));
  return () => observer.disconnect();
};

const initScrollProgress = () => {
  const progressBar = document.querySelector("#scrollProgress");
  const backToTop = document.querySelector("#backToTop");
  if (!progressBar && !backToTop) return;

  const scroll = createUseScroll();
  const unsubscribe = scroll.subscribe((progress) => {
    document.documentElement.style.setProperty("--scroll-progress", progress.toFixed(4));
    if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
    backToTop?.classList.toggle("visible", progress > 0.12);
  });

  pageMotionCleanups.push(() => {
    unsubscribe();
    scroll.destroy();
  });
};

const initSmoothScrollEngine = () => {
  if (smoothScrollReady) return;
  smoothScrollReady = true;
  document.documentElement.dataset.scrollEngine = "lenis-locomotive-inspired";

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
};

const initViewportMotion = () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const trackedItems = gsap.utils.toArray("[data-view-step], .card, .panel, .stat, .station-card, .scanner-card");
  const cleanup = observeInView(trackedItems, (element, isInView) => {
    element.classList.toggle("is-in-view", isInView);
  });
  pageMotionCleanups.push(cleanup);

  if (reduceMotion) return;

  app.querySelectorAll("[data-split-text]").forEach((heading) => {
    const chars = splitTextLikeSplitType(heading);
    if (!chars.length) return;
    gsap.from(chars, {
      yPercent: 110,
      opacity: 0,
      rotateX: -55,
      duration: 0.78,
      ease: "expo.out",
      stagger: 0.012,
      scrollTrigger: {
        trigger: heading,
        start: "top 84%",
      },
    });
  });
};

const initStickyStoryMotion = () => {
  const story = document.querySelector("[data-sticky-story]");
  if (!story || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const steps = gsap.utils.toArray(".sticky-step", story);
  gsap.to(story, {
    "--story-progress": 1,
    ease: "none",
    scrollTrigger: {
      trigger: story,
      start: "top 78%",
      end: "bottom 28%",
      scrub: 0.8,
    },
  });

  steps.forEach((step, index) => {
    gsap.from(step, {
      x: index % 2 === 0 ? -44 : 44,
      opacity: 0,
      rotate: index % 2 === 0 ? -2 : 2,
      duration: 0.7,
      ease: "back.out(1.5)",
      scrollTrigger: {
        trigger: step,
        start: "top 84%",
      },
    });
  });
};

const initBinBurstMotion = () => {
  const scene = document.querySelector("[data-bin-burst]");
  if (!scene || scene.dataset.burstReady) return;
  scene.dataset.burstReady = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pieces = gsap.utils.toArray(".trash-piece", scene);
  const bin = scene.querySelector(".burst-bin");
  const ring = scene.querySelector(".burst-ring");
  if (!pieces.length || !bin || !ring) return;

  if (reduceMotion) {
    pieces.forEach((piece) => piece.classList.add("is-in-view"));
    return;
  }

  gsap.set(pieces, {
    x: 0,
    y: 126,
    scale: 0.25,
    opacity: 0,
    rotate: 0,
    transformOrigin: "50% 50%",
  });
  gsap.set(ring, { scale: 0.4, opacity: 0 });

  const burstTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: scene,
      start: "top 72%",
      end: "bottom 28%",
      scrub: 0.8,
    },
  });

  burstTimeline
    .fromTo(bin, { y: 18, rotate: -1 }, { y: 0, rotate: 0, duration: 0.18, ease: "back.out(2)" })
    .to(ring, { scale: 1.45, opacity: 0.9, duration: 0.22, ease: "power2.out" }, 0.08)
    .to(ring, { scale: 2.1, opacity: 0, duration: 0.34, ease: "power2.out" }, 0.25)
    .to(".trash-piece.bottle", { x: -188, y: -176, scale: 1, opacity: 1, rotate: -28, duration: 0.56, ease: "back.out(1.7)" }, 0.1)
    .to(".trash-piece.paper", { x: -76, y: -238, scale: 1, opacity: 1, rotate: 18, duration: 0.58, ease: "back.out(1.8)" }, 0.13)
    .to(".trash-piece.can", { x: 94, y: -212, scale: 1, opacity: 1, rotate: 34, duration: 0.56, ease: "back.out(1.7)" }, 0.16)
    .to(".trash-piece.wrapper", { x: 198, y: -120, scale: 1, opacity: 1, rotate: 50, duration: 0.58, ease: "back.out(1.8)" }, 0.19)
    .to(".trash-piece.carton", { x: -148, y: -70, scale: 1, opacity: 1, rotate: 14, duration: 0.48, ease: "back.out(1.7)" }, 0.23)
    .to(".trash-piece.cup", { x: 132, y: -58, scale: 1, opacity: 1, rotate: -18, duration: 0.48, ease: "back.out(1.7)" }, 0.25)
    .to(".trash-piece.spark", { y: -190, scale: 1, opacity: 1, rotate: 180, duration: 0.4, ease: "power3.out" }, 0.12)
    .to(pieces, { y: "+=18", repeat: 1, yoyo: true, duration: 0.24, ease: "sine.inOut", stagger: 0.018 }, 0.66);
};

const initRouteMapMotion = () => {
  const map = document.querySelector("[data-route-map]");
  if (!map || map.dataset.routeReady) return;
  map.dataset.routeReady = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const route = map.querySelector(".route-draw");
  const points = gsap.utils.toArray("[data-route-point]", map);
  const glitter = gsap.utils.toArray(".route-glitter circle", map);
  const routeLength = route?.getTotalLength?.() || 0;

  if (!route || reduceMotion) {
    map.classList.add("route-ready");
    return;
  }

  gsap.set(route, { strokeDasharray: routeLength, strokeDashoffset: routeLength });
  gsap.set(points, { opacity: 0, scale: 0.65, transformOrigin: "center center" });
  gsap.set(glitter, { opacity: 0, scale: 0.4, transformOrigin: "center center" });

  const routeTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: map,
      start: "top 78%",
      end: "bottom 38%",
      scrub: 0.9,
    },
  });

  routeTimeline
    .to(route, { strokeDashoffset: 0, duration: 1, ease: "none" })
    .to(points, {
      opacity: 1,
      scale: 1,
      duration: 0.34,
      ease: "back.out(2.4)",
      stagger: 0.08,
    }, 0.04)
    .to(glitter, {
      opacity: 1,
      scale: 1.6,
      duration: 0.18,
      repeat: 3,
      yoyo: true,
      ease: "sine.inOut",
      stagger: 0.05,
    }, 0.16)
    .to(points, {
      filter: "drop-shadow(0 0 10px rgba(255, 198, 0, 0.85))",
      duration: 0.2,
      stagger: 0.05,
    }, 0.22);
};

const initHomeAnimations = () => {
  const hero = document.querySelector("[data-home-hero]");
  if (!hero || hero.dataset.gsapReady) return;
  hero.dataset.gsapReady = "true";

  const heroVideo = hero.querySelector("#heroVideoBg");
  if (heroVideo) {
    const keepHeroVideoPlaying = () => {
      if (heroVideo.tagName === "IFRAME") {
        heroVideo.contentWindow?.postMessage(JSON.stringify({
          event: "command",
          func: "mute",
          args: [],
        }), "https://www.youtube.com");
        heroVideo.contentWindow?.postMessage(JSON.stringify({
          event: "command",
          func: "playVideo",
          args: [],
        }), "https://www.youtube.com");
        return;
      }

      heroVideo.muted = true;
      heroVideo.play?.().catch(() => {
        // Some browsers delay autoplay until they decide the page is ready.
      });
    };
    const playInterval = window.setInterval(keepHeroVideoPlaying, 3500);
    heroVideo.addEventListener("load", keepHeroVideoPlaying);
    document.addEventListener("visibilitychange", keepHeroVideoPlaying);
    window.setTimeout(keepHeroVideoPlaying, 400);
    pageMotionCleanups.push(() => {
      window.clearInterval(playInterval);
      heroVideo.removeEventListener("load", keepHeroVideoPlaying);
      document.removeEventListener("visibilitychange", keepHeroVideoPlaying);
    });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const copyItems = gsap.utils.toArray(".landing-copy .eyebrow, .landing-copy h1, .landing-copy .lead, .hero-metrics, .trust-row, .hero-actions", hero);
  if (copyItems.length) {
    gsap.from(copyItems, {
      y: 28,
      opacity: 0,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.08,
    });
  }

  const showcaseImage = hero.querySelector(".showcase-image");
  if (showcaseImage) {
    gsap.from(showcaseImage, {
      y: 42,
      scale: 0.94,
      opacity: 0,
      duration: 1,
      ease: "power3.out",
      delay: 0.2,
    });

    gsap.to(showcaseImage, {
      y: -14,
      duration: 3.8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  const flowerArt = hero.querySelector(".flower-art");
  if (flowerArt) {
    gsap.to(flowerArt, {
      rotate: 7,
      y: -10,
      duration: 4.6,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  const shelf = document.querySelector("[data-store-shelf]");
  const storeCards = gsap.utils.toArray(".store-card");
  storeCards.forEach((card, index) => {
    const image = card.querySelector("img");
    gsap.set(card, { transformOrigin: "center bottom" });
    gsap.to(card, {
      y: index % 2 === 0 ? -10 : 10,
      duration: 4 + index * 0.25,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: index * 0.12,
    });

    if (image) {
      gsap.to(image, {
        yPercent: -6,
        ease: "none",
        scrollTrigger: {
          trigger: card,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.8,
        },
      });
    }
  });

  const storeRevealItems = gsap.utils.toArray(".store-headline > *, .store-card");
  if (shelf && storeRevealItems.length) {
    gsap.from(storeRevealItems, {
      scrollTrigger: {
        trigger: shelf,
        start: "top 78%",
      },
      y: 34,
      opacity: 0,
      duration: 0.75,
      ease: "power3.out",
      stagger: 0.08,
    });
  }

  const storeCardRow = document.querySelector(".store-card-row");
  if (shelf && storeCardRow) {
    gsap.fromTo(storeCardRow, { x: 46 }, {
      x: -34,
      ease: "none",
      scrollTrigger: {
        trigger: shelf,
        start: "top bottom",
        end: "bottom top",
        scrub: 1,
      },
    });
  }

  const landingBand = document.querySelector(".landing-band");
  const landingItems = gsap.utils.toArray(".landing-band .section-title, .landing-band .process-card");
  if (landingBand && landingItems.length) {
    gsap.from(landingItems, {
      scrollTrigger: {
        trigger: landingBand,
        start: "top 80%",
      },
      y: 30,
      opacity: 0,
      duration: 0.7,
      ease: "power3.out",
      stagger: 0.07,
    });
  }
};

const initGlobalPageAnimations = () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  const page = app.querySelector(".page, .content-band, .landing-auth");
  if (!page || page.dataset.motionReady) return;
  page.dataset.motionReady = "true";

  const pageIntro = gsap.utils.toArray(".section-title, .dashboard-header, .auth-card, .profile-card, .map-layout, .scan-page-shell", page);
  if (pageIntro.length) {
    gsap.from(pageIntro, {
      y: 22,
      opacity: 0,
      duration: 0.72,
      ease: "power3.out",
      stagger: 0.06,
    });
  }

  const motionItems = gsap.utils.toArray([
    ".card",
    ".panel",
    ".stat",
    ".choice",
    ".station-card",
    ".scanner-card",
    ".table-wrap",
    ".inline-form",
    ".education-video-card",
    ".leaderboard > div",
    ".request-list > div",
    ".status-list > div",
    ".work-list > button",
  ].join(", "), page);

  if (motionItems.length) {
    gsap.from(motionItems, {
      scrollTrigger: {
        trigger: page,
        start: "top 85%",
      },
      y: 26,
      opacity: 0,
      duration: 0.62,
      ease: "power3.out",
      stagger: 0.045,
    });
  }

  page.querySelectorAll(".card img, .split-img, .profile-avatar").forEach((image) => {
    gsap.fromTo(image, { scale: 1.035 }, {
      scale: 1,
      duration: 1.1,
      ease: "power3.out",
      scrollTrigger: {
        trigger: image,
        start: "top 92%",
      },
    });
  });
};

const initAuthMascotMotion = () => {
  const mascot = app.querySelector("[data-auth-mascot]");
  if (!mascot || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const pupils = [...mascot.querySelectorAll(".auth-pupil")];
  if (!pupils.length) return;

  const moveEyes = (event) => {
    pupils.forEach((pupil) => {
      const eye = pupil.parentElement;
      const rect = eye.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
      const radius = Math.min(rect.width, rect.height) * 0.18;
      pupil.style.transform = `translate(calc(-50% + ${Math.cos(angle) * radius}px), calc(-50% + ${Math.sin(angle) * radius}px))`;
    });
  };

  const resetEyes = () => {
    pupils.forEach((pupil) => {
      pupil.style.transform = "translate(-50%, -50%)";
    });
  };

  window.addEventListener("pointermove", moveEyes);
  window.addEventListener("pointerleave", resetEyes);
  pageMotionCleanups.push(() => {
    window.removeEventListener("pointermove", moveEyes);
    window.removeEventListener("pointerleave", resetEyes);
  });
};

const initFaqAccordion = () => {
  const faqItems = app.querySelectorAll(".faq-item");
  if (!faqItems.length) return;

  faqItems.forEach(item => {
    const question = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    const toggle = item.querySelector(".faq-toggle");

    question.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      faqItems.forEach(i => {
        i.classList.remove("open");
        const a = i.querySelector(".faq-answer");
        const t = i.querySelector(".faq-toggle");
        if (a) a.style.maxHeight = null;
        if (t) t.textContent = "+";
      });
      if (!isOpen) {
        item.classList.add("open");
        if (answer) answer.style.maxHeight = answer.scrollHeight + "px";
        if (toggle) toggle.textContent = "−";
      }
    });
  });
};

const initGuideFlipbook = () => {
  const flipbook = app.querySelector("[data-guide-flipbook]");
  if (!flipbook || flipbook.dataset.flipReady) return;
  flipbook.dataset.flipReady = "true";

  const pages = [...flipbook.querySelectorAll("[data-guide-page]")];
  const dots = [...flipbook.querySelectorAll(".guide-flip-dots span")];
  const controls = [...flipbook.querySelectorAll("[data-guide-flip]")];
  let activePage = 0;

  const setPage = (nextPage) => {
    activePage = (nextPage + pages.length) % pages.length;
    pages.forEach((page, index) => {
      page.classList.toggle("is-active", index === activePage);
      page.classList.toggle("is-before", index < activePage);
    });
    dots.forEach((dot, index) => {
      dot.classList.toggle("active", index === activePage);
    });
  };

  controls.forEach((control) => {
    control.addEventListener("click", () => {
      setPage(activePage + (control.dataset.guideFlip === "next" ? 1 : -1));
    });
  });
};

const initFormValidationMode = () => {
  app.querySelectorAll("form").forEach((form) => {
    form.noValidate = true;
  });
};

const initPagePlugins = () => {
  initFormValidationMode();
  initSmoothScrollEngine();
  initLeafletMap();
  initCollectionMap();
  initQrGenerator();
  initReportChart();
  initThreeGame();
  initScanVerificationPrompt();
  if (role() === "user" && state.page === "select-waste" && state.locationCheck?.verified) {
    initAiSensorCameras();
  }
  initScrollProgress();
  initViewportMotion();
  initStickyStoryMotion();
  initBinBurstMotion();
  initRouteMapMotion();
  initGlobalPageAnimations();
  initAuthMascotMotion();
  initHomeAnimations();
  initFaqAccordion();
  initGuideFlipbook();
  ScrollTrigger.refresh();
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
    Paper: 0x1f5d99,
    Plastic: 0x1f7a45,
    "Aluminium": 0xd8a21d,
    "General Waste": 0x2b2f32,
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
  } else if (item.shape === "can") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.72, 32), material);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.035, 32), new THREE.MeshStandardMaterial({ color: 0xd9e4df, metalness: 0.55, roughness: 0.28 }));
    const bottom = top.clone();
    top.position.y = 0.38;
    bottom.position.y = -0.38;
    group.add(body, top, bottom);
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
    createBin({ type: "Paper", color: 0x1f5d99, x: -3.6 }),
    createBin({ type: "Plastic", color: 0x1f7a45, x: -1.2 }),
    createBin({ type: "Aluminium", color: 0xd8a21d, x: 1.2 }),
    createBin({ type: "General Waste", color: 0x2b2f32, x: 3.6 }),
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
  const page = params.get("page");
  if (page && routeSets[role()]?.includes(page)) {
    state.page = page;
    saveState();
  }

  const stationCode = params.get("station");
  if (stationCode) {
    handleStationFromQr(stationCode);
    return;
  }

  const binId = params.get("bin");
  if (binId) handleBinFromQr(binId);
};

const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      const showUpdateReady = (worker) => {
        waitingServiceWorker = worker;
        Swal.fire({
          title: "Update available",
          text: "A newer EcoCycle version is ready.",
          icon: "info",
          showCancelButton: true,
          confirmButtonText: "Update now",
          cancelButtonText: "Later",
          confirmButtonColor: "#0b0b0d",
        }).then((result) => {
          if (result.isConfirmed) waitingServiceWorker?.postMessage({ type: "SKIP_WAITING" });
        });
      };

      if (registration.waiting && navigator.serviceWorker.controller) showUpdateReady(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateReady(worker);
        });
      });
    }).catch(() => {
      // The app still works normally if the browser blocks service workers.
    });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
};

const renderInstallPrompt = () => {
  let prompt = document.querySelector("#installPrompt");
  if (!prompt) {
    prompt = document.createElement("div");
    prompt.id = "installPrompt";
    prompt.className = "install-prompt hidden";
    prompt.innerHTML = `
      <div>
        <strong>Install EcoCycle</strong>
        <span>Add it to your phone for a full-screen app experience.</span>
      </div>
      <button class="primary-btn" data-action="install-pwa">Install</button>
    `;
    document.body.appendChild(prompt);
  }

  prompt.classList.toggle("hidden", !deferredInstallPrompt);
};

const isStandaloneApp = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const installHelpText = () => {
  const isAppleMobile = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  if (isAppleMobile) {
    return "On iPhone or iPad, open this site in Safari, tap Share, then choose Add to Home Screen.";
  }

  return "On desktop or Android Chrome, use the Install icon in the address bar or browser menu. If it does not appear yet, refresh once and try again.";
};

const showInstallPrompt = async () => {
  if (isStandaloneApp()) {
    showToast("EcoCycle is already installed.");
    return;
  }

  if (!deferredInstallPrompt) {
    Swal.fire({
      title: "Install EcoCycle",
      text: installHelpText(),
      icon: "info",
      confirmButtonText: "Got it",
      confirmButtonColor: "#0b0b0d",
    });
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  renderInstallPrompt();
};

const initPwaInstallPrompt = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstallPrompt();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    renderInstallPrompt();
    showToast("EcoCycle installed.");
  });
};

const renderNetworkStatus = () => {
  let prompt = document.querySelector("#networkStatus");
  if (!prompt) {
    prompt = document.createElement("div");
    prompt.id = "networkStatus";
    prompt.className = "install-prompt network-status hidden";
    prompt.innerHTML = `
      <div>
        <strong>Offline mode</strong>
        <span>You can keep browsing cached pages. Live sync resumes when connection returns.</span>
      </div>
    `;
    document.body.appendChild(prompt);
  }

  prompt.classList.toggle("hidden", navigator.onLine);
};

const initNetworkStatus = () => {
  renderNetworkStatus();
  window.addEventListener("online", () => {
    renderNetworkStatus();
    showToast("Back online. Sync can resume.");
  });
  window.addEventListener("offline", renderNetworkStatus);
};

const startApp = async () => {
  render();
  await initializeDatabase();
  initIncomingBinFromUrl();
  appReady = true;
  render();
};

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", handleChange);
document.addEventListener("change", handleChange);

registerServiceWorker();
initPwaInstallPrompt();
initNetworkStatus();
startApp();
