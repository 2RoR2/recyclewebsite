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
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { collectionLocation, initializeDatabase, saveState, state } from "./backend/database.js";
import { adminService, authService, currentUser, feedbackService, learningService, recyclingService, rewardService, role, selectedBin } from "./backend/services.js";
import { renderAdminPage } from "./features/admin/pages.js";
import { renderGuestPage } from "./features/guest/pages.js";
import { renderNav } from "./features/shared/navigation.js";
import { binStations, renderNotFound } from "./features/shared/templates.js";
import { renderUserPage } from "./features/user/pages.js";
import { getScanTarget, normalizeCode } from "./features/qr/scan-routing.js";
import { selectedZoneSourceRectFromRects } from "./features/ai/zone-crop.js";

const app = document.querySelector("#app");
const navLinks = document.querySelector("#navLinks");
const navActions = document.querySelector("#navActions");
const toast = document.querySelector("#toast");
let qrScanner = null;
let reportChart = null;
let threeGameCleanup = null;
let aiCameraStream = null;
let aiScanBusy = false;
let qrScanBusy = false;
let gpsPromptOpen = false;
let autoLocationBusy = false;
let aiCountdownOpen = false;
let lastGpsPromptKey = "";
let appReady = false;
let deferredInstallPrompt = null;
let installPromptDismissed = false;
let installPromptWaiter = null;
let waitingServiceWorker = null;
let pageMotionCleanups = [];
let smoothScrollReady = false;

gsap.registerPlugin(ScrollTrigger);
RectAreaLightUniformsLib.init();

const scanUrlForStation = (stationCode) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("station", stationCode);
  return url.toString();
};

const scanUrlForBinCode = (binCode) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("bin", binCode);
  return url.toString();
};

const stationBinsForSelectedLocation = () => {
  const activeBin = selectedBin();
  return state.bins.filter((bin) => bin.station === activeBin.station);
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
  const target = getScanTarget(scanValue, state.bins, window.location.origin);
  return target.type === "station"
    ? handleStationFromQr(target.code, options)
    : handleBinFromQr(target.code, options);
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
  const errorWords = ["unable", "failed", "try again", "wrong", "unknown", "not enough", "no points", "could not", "false", "missing"];
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

  if (target.dataset.action === "close-install-prompt") {
    installPromptDismissed = true;
    renderInstallPrompt();
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
      if (state.locationCheck?.verified) {
        window.setTimeout(() => {
          void promptStartDetection();
        }, 350);
      } else {
        showToast("Zone selected. Verify GPS, then run AI detection.");
      }
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
    const result = adminService.addBin();
    if (result?.message) showToast(result.message);
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

  if (target.dataset.deleteBin) {
    const confirmed = window.confirm("Delete this bin? Existing records will remain, but the bin will no longer be available.");
    if (!confirmed) return;
    const result = adminService.deleteBin(target.dataset.deleteBin);
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

  if (target.dataset.passwordToggle !== undefined) {
    const input = target.closest(".password-control")?.querySelector("input");
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    target.classList.toggle("showing", !showing);
    target.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    target.setAttribute("title", showing ? "Show password" : "Hide password");
    return;
  }

  handleNavigation(target);
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
  if (form.dataset.form === "feedback") result = feedbackService.submitFeedback(formData);
  if (form.dataset.form === "add-bin") result = adminService.addBin(formData);
  if (form.dataset.form === "edit-bin") result = adminService.updateBin(formData);
  if (form.dataset.form === "add-reward") result = adminService.addReward(formData);
  if (form.dataset.form === "add-user") result = adminService.addUser(formData);
  if (form.dataset.form === "edit-managed-user") result = adminService.editUserByAdmin(formData);
  if (form.dataset.form === "profile") result = authService.updateProfile(formData);

  if (result?.message) showToast(result.message);
  if (result?.ok === false) return;
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
    confidence: 70,
    rawConfidence: 70,
    topPredictions: [],
    box: { x: 128, y: 84, width: 260, height: 260 },
    model: "Browser heuristic fallback",
    presenceDetected: true,
    detectorAvailable: false,
  };
};

const AI_MIN_DECISION_CONFIDENCE = 70;
const AI_TRAINING_CONFIDENCE = 70;

const configuredAiApiBaseUrl = (import.meta.env.VITE_AI_API_BASE_URL || "").replace(/\/+$/, "");
const isLocalHost = () => ["localhost", "127.0.0.1"].includes(window.location.hostname);
const localAiApiBaseUrl = "http://127.0.0.1:8000";
const aiApiBaseUrl = () => configuredAiApiBaseUrl || (isLocalHost() ? localAiApiBaseUrl : "");

const normalizeAiDetection = (result) => {
  const confidence = Math.max(0, Math.min(100, Math.round(Number(result?.confidence) || 0)));
  const rawConfidence = Math.max(0, Math.min(100, Math.round(Number(result?.rawConfidence ?? result?.confidence) || 0)));
  return {
    ...result,
    confidence,
    rawConfidence,
    presenceDetected: result?.presenceDetected !== false,
    detectorAvailable: result?.detectorAvailable !== false,
    topPredictions: Array.isArray(result?.topPredictions) ? result.topPredictions : [],
  };
};

const detectWasteWithAi = async (file) => {
  try {
    const { detectWasteInBrowser } = await import("./features/ai/browser-detector.js");
    return normalizeAiDetection(await detectWasteInBrowser(file));
  } catch {
    // Browser AI is free and preferred. Hosted/local APIs are only fallbacks.
  }

  const formData = new FormData();
  formData.append("image", file);

  const externalAiApiBaseUrl = aiApiBaseUrl();

  if (externalAiApiBaseUrl) {
    try {
      const response = await fetch(`${externalAiApiBaseUrl}/detect-waste`, { method: "POST", body: formData });
      if (!response.ok) throw new Error("AI detector unavailable");
      const result = await response.json();
      if (!result?.category || !result?.label) throw new Error("Invalid AI detector result");
      return normalizeAiDetection(result);
    } catch {
      // Continue to Vercel API fallback.
    }
  }

  try {
    const response = await fetch("/api/detect-waste", { method: "POST", body: formData });
    if (!response.ok) throw new Error("Hosted AI detector unavailable");
    const result = await response.json();
    if (!result?.category || !result?.label) throw new Error("Invalid hosted AI detector result");
    return normalizeAiDetection(result);
  } catch {
    return normalizeAiDetection(localYoloFallback(file));
  }
};

const selectedZoneElement = (selectedZone) =>
  [...document.querySelectorAll("[data-zone-select]")]
    .find((button) => button.dataset.zoneSelect === selectedZone) || null;

const selectedZoneSourceRect = (video, selectedZone) => {
  const zoneElement = selectedZoneElement(selectedZone);
  if (!zoneElement) return null;

  const videoRect = video.getBoundingClientRect();
  const zoneRect = zoneElement.getBoundingClientRect();
  return selectedZoneSourceRectFromRects({
    frameWidth: video.videoWidth || 640,
    frameHeight: video.videoHeight || 480,
    videoRect,
    zoneRect,
  });
};

const frameToBlob = (video, selectedZone = null) =>
  new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const frameWidth = video.videoWidth || 640;
    const frameHeight = video.videoHeight || 480;
    const selectedSource = selectedZoneSourceRect(video, selectedZone);
    const sourceX = selectedSource ? Math.round(selectedSource.x) : 0;
    const sourceY = selectedSource ? Math.round(selectedSource.y) : 0;
    const sourceWidth = selectedSource ? Math.round(selectedSource.width) : frameWidth;
    const sourceHeight = selectedSource ? Math.round(selectedSource.height) : frameHeight;

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
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
  formData.append("use_for_training", String(correct && detection.confidence >= AI_TRAINING_CONFIDENCE));

  const externalAiApiBaseUrl = aiApiBaseUrl();
  if (!externalAiApiBaseUrl) return;

  try {
    await fetch(`${externalAiApiBaseUrl}/collect-sample`, { method: "POST", body: formData });
  } catch {
    // Sample collection is optional and only runs when an AI training service is available.
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
    if (!detection.detectorAvailable) {
      await Swal.fire({
        title: "AI Detector Unavailable",
        text: "Start the local AI API or configure the hosted AI key, then scan again. The fallback result is not reliable enough to record.",
        icon: "warning",
        confirmButtonColor: "#0b0b0d",
      });
      render();
      return;
    }

    if (!detection.presenceDetected) {
      await Swal.fire({
        title: "No Item In Selected Zone",
        text: `Place the rubbish fully inside the ${zoneCategory} sensor zone, then scan again. Items outside the selected zone are ignored.`,
        icon: "warning",
        confirmButtonColor: "#0b0b0d",
      });
      render();
      return;
    }

    if (detection.confidence < AI_MIN_DECISION_CONFIDENCE) {
      await Swal.fire({
        title: "Low Confidence",
        text: `Detection confidence is ${detection.confidence}%. Move the rubbish closer to the camera or improve lighting, then scan again.`,
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
      const resultSentence = correct
        ? `${detection.category} was detected. It matches the ${zoneCategory} bin. You earned 1 point.`
        : `${detection.category} was detected. It should be placed in the ${detection.category} bin, not the ${zoneCategory} bin. No point was added.`;
      collectAiTrainingSample({ blob, zoneCategory, detection, correct });
      await Swal.fire({
        title: correct ? "Correct Disposal!" : "Wrong Bin Detected",
        html: `
          <div class="ai-result-modal">
            <p><strong>${resultSentence}</strong></p>
            <p>The selected zone was ${zoneCategory}, using ${matchedStationBin.name}.</p>
            <p>The camera detected ${detection.label} with ${detection.confidence}% confidence.</p>
            ${detection.rawConfidence !== detection.confidence ? `<p><strong>Raw model score:</strong> ${detection.rawConfidence}%</p>` : ""}
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

  const adminBinForm = event.target.closest?.('[data-form="add-bin"], [data-form="edit-bin"]');
  if (adminBinForm && ["station", "accepts"].includes(event.target.name)) {
    updateAdminBinForm(adminBinForm, { fillStation: event.target.name === "station" });
    return;
  }

  if (adminBinForm && event.target.name === "qrCode") {
    const canvas = adminBinForm.querySelector("[data-bin-qr-preview]");
    if (canvas) canvas.dataset.readyValue = "";
    initQrGenerator();
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

  document.querySelectorAll("[data-bin-qr-preview]").forEach((canvas) => {
    const form = canvas.closest("form");
    const qrCode = form?.elements.qrCode?.value?.trim();
    if (!form || !qrCode) return;
    const scanUrl = scanUrlForBinCode(qrCode);
    if (canvas.dataset.readyValue === scanUrl) return;
    canvas.dataset.readyValue = scanUrl;
    QRCode.toCanvas(canvas, scanUrl, { width: 132, margin: 1 });
    const urlLabel = form.querySelector("[data-bin-qr-url]");
    if (urlLabel) urlLabel.textContent = scanUrl;
  });
};

const binCategorySuffix = (category) => ({
  Paper: "PAP",
  Plastic: "PLA",
  Aluminium: "ALU",
  "General Waste": "GEN",
}[category] || "BIN");

const stationCodeForName = (stationName) => {
  const existingStation = binStations().find((station) => station.name.toLowerCase() === String(stationName || "").trim().toLowerCase());
  if (existingStation?.code) return existingStation.code;
  const words = String(stationName || "Custom")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const code = words.length > 1
    ? words.map((word) => word[0]).join("")
    : (words[0] || "CUS").slice(0, 3);
  return code.toUpperCase().padEnd(3, "X").slice(0, 3);
};

const stationPresetForName = (stationName) => {
  const station = binStations().find((item) => item.name.toLowerCase() === String(stationName || "").trim().toLowerCase());
  if (!station) return null;
  const firstBin = station.bins[0] || {};
  return {
    location: station.location || firstBin.location || "",
    lat: station.lat || firstBin.lat || "",
    lng: station.lng || firstBin.lng || "",
    mapX: firstBin.mapX || 50,
    mapY: firstBin.mapY || 50,
  };
};

const updateAdminBinForm = (form, { fillStation = false, autoCode = true } = {}) => {
  if (!form?.matches('[data-form="add-bin"], [data-form="edit-bin"]')) return;
  const station = form.elements.station?.value?.trim() || "";
  const category = form.elements.accepts?.value || "Plastic";
  const preset = stationPresetForName(station);
  const qrCode = `${stationCodeForName(station)}-${binCategorySuffix(category)}`;

  if (fillStation && preset) {
    if (form.elements.location) form.elements.location.value = preset.location;
    if (form.elements.lat) form.elements.lat.value = Number(preset.lat).toFixed(6);
    if (form.elements.lng) form.elements.lng.value = Number(preset.lng).toFixed(6);
    if (form.elements.mapX) form.elements.mapX.value = Math.round(Number(preset.mapX) || 50);
    if (form.elements.mapY) form.elements.mapY.value = Math.round(Number(preset.mapY) || 50);
  }

  if (autoCode && form.elements.qrCode) form.elements.qrCode.value = qrCode;
  if (autoCode && form.elements.name && station) form.elements.name.value = `${station} ${category} Bin`;
  const canvas = form.querySelector("[data-bin-qr-preview]");
  if (canvas) {
    canvas.dataset.readyValue = "";
    initQrGenerator();
  }
};

const initAdminBinForms = () => {
  document.querySelectorAll('[data-form="add-bin"], [data-form="edit-bin"]').forEach((form) => {
    updateAdminBinForm(form, { fillStation: false, autoCode: form.dataset.form === "add-bin" && Boolean(form.elements.station?.value) });
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
  initAdminBinForms();
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

const makeTextSprite = (text, color = "#10251d", options = {}) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const background = options.background || "rgba(255, 255, 255, 0.96)";
  const radius = 28;
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(10, 14, canvas.width - 20, canvas.height - 28, radius);
  context.fill();
  context.strokeStyle = options.border || "rgba(16, 37, 29, 0.16)";
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = color;
  context.font = `bold ${options.fontSize || 42}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(options.width || 2.5, options.height || 0.62, 1);
  sprite.renderOrder = 20;
  return sprite;
};

const makeTextTexture = (text, color = "#10251d", options = {}) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  const background = options.background || "rgba(255, 255, 255, 0.98)";
  const radius = 28;
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(14, 18, canvas.width - 28, canvas.height - 36, radius);
  context.fill();
  context.strokeStyle = options.border || "rgba(16, 37, 29, 0.2)";
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = color;
  context.font = `bold ${options.fontSize || 52}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const makeDetailPlane = (width, height, color, options = {}) => {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = options.name || "detail";
  return mesh;
};

const createBin = ({ type, color, x }) => {
  const group = new THREE.Group();
  group.userData = { type };

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 1.8, 1.25),
    new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.32,
      roughness: 0.36,
      clearcoat: 0.18,
      clearcoatRoughness: 0.26,
    })
  );
  body.position.y = 0.9;
  group.add(body);

  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.12, 1.05),
    new THREE.MeshPhysicalMaterial({ color: 0x10251d, metalness: 0.25, roughness: 0.3 })
  );
  opening.position.y = 1.86;
  group.add(opening);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(type === "General Waste" ? 1.34 : 1.08, 0.42),
    new THREE.MeshBasicMaterial({
      map: makeTextTexture(type, "#10251d", { fontSize: type === "General Waste" ? 42 : 50 }),
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  label.name = `${type} label`;
  label.position.set(0, 1.16, 0.631);
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
  const material = new THREE.MeshPhysicalMaterial({
    color: colors[item.bin] || 0x8fd6d2,
    metalness: item.shape === "can" ? 0.58 : 0.08,
    roughness: item.shape === "can" ? 0.22 : 0.5,
    clearcoat: item.shape === "bottle" ? 0.72 : 0.2,
    clearcoatRoughness: 0.18,
  });
  const group = new THREE.Group();
  group.userData = { item };

  if (item.shape === "bottle") {
    const plastic = new THREE.MeshPhysicalMaterial({
      color: 0x98e8d8,
      transparent: true,
      opacity: 0.54,
      transmission: 0.28,
      metalness: 0.02,
      roughness: 0.13,
      clearcoat: 0.86,
      clearcoatRoughness: 0.08,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.9, 36), plastic);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.18, 36), plastic);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.26, 28), plastic);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.1, 28), new THREE.MeshPhysicalMaterial({ color: 0x0f7d54, metalness: 0.06, roughness: 0.36 }));
    const labelBand = new THREE.Mesh(new THREE.CylinderGeometry(0.268, 0.328, 0.19, 36, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    const ribs = [-0.25, -0.08, 0.12].map((y) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.011, 8, 42), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      return ring;
    });
    shoulder.position.y = 0.54;
    neck.position.y = 0.76;
    cap.position.y = 0.96;
    labelBand.position.y = 0.08;
    group.add(body, shoulder, neck, cap, labelBand, ...ribs);
  } else if (item.shape === "cup") {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.58, 28), material);
    cup.rotation.z = 0.15;
    group.add(cup);
  } else if (item.shape === "paper") {
    if (item.name.toLowerCase().includes("tissue")) {
      const tissueMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf7f3e8, metalness: 0, roughness: 0.82 });
      const softFoldMaterial = new THREE.MeshBasicMaterial({
        color: 0xfffbef,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });
      const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.54, 8, 18), tissueMaterial);
      core.scale.set(1.4, 0.56, 0.78);
      core.rotation.set(0.15, 0, Math.PI / 2);
      group.add(core);

      [
        { size: [0.92, 0.42], pos: [0, 0.06, 0.02], rot: [-1.18, 0.16, -0.18] },
        { size: [0.68, 0.34], pos: [-0.25, 0.08, -0.05], rot: [-1.05, -0.34, 0.42] },
        { size: [0.58, 0.3], pos: [0.28, 0.07, 0.08], rot: [-1.28, 0.38, -0.46] },
        { size: [0.46, 0.24], pos: [0.02, 0.15, -0.18], rot: [-0.92, 0.74, 0.08] },
      ].forEach((fold) => {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(fold.size[0], fold.size[1], 5, 3), softFoldMaterial.clone());
        sheet.position.set(...fold.pos);
        sheet.rotation.set(...fold.rot);
        group.add(sheet);
      });

      const twistA = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 16), tissueMaterial);
      const twistB = twistA.clone();
      twistA.position.set(-0.48, 0.02, 0);
      twistB.position.set(0.48, 0.02, 0);
      twistA.rotation.set(0, 0, Math.PI / 2);
      twistB.rotation.set(0, 0, -Math.PI / 2);
      group.add(twistA, twistB);
    } else {
      const paperMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf5efd7, metalness: 0, roughness: 0.72 });
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.045, 0.76), paperMaterial);
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.052, 0.2), new THREE.MeshPhysicalMaterial({ color: 0xe6dfc6, metalness: 0, roughness: 0.78 }));
      fold.position.set(0.22, 0.045, 0.2);
      group.add(sheet, fold);
      [-0.24, -0.08, 0.08, 0.24].forEach((z, index) => {
        const line = makeDetailPlane(index === 0 ? 0.34 : 0.72, 0.018, 0x39443b, { opacity: 0.42 });
        line.rotation.x = -Math.PI / 2;
        line.position.set(index === 0 ? -0.26 : 0, 0.034, z);
        group.add(line);
      });
      const photoBlock = makeDetailPlane(0.28, 0.22, 0x8fb7c6, { opacity: 0.7 });
      photoBlock.rotation.x = -Math.PI / 2;
      photoBlock.position.set(0.29, 0.036, -0.18);
      group.add(photoBlock);
    }
  } else if (item.shape === "box") {
    const cardboard = new THREE.MeshPhysicalMaterial({ color: 0xb88745, metalness: 0.02, roughness: 0.82 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.54, 0.66), cardboard);
    const flapMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd1a35d, metalness: 0, roughness: 0.8 });
    const flapFront = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.28), flapMaterial);
    const flapBack = flapFront.clone();
    const tape = makeDetailPlane(0.15, 0.7, 0xe9d58e, { opacity: 0.78 });
    flapFront.position.set(0, 0.3, 0.22);
    flapBack.position.set(0, 0.3, -0.22);
    flapFront.rotation.x = -0.35;
    flapBack.rotation.x = 0.35;
    tape.rotation.x = -Math.PI / 2;
    tape.position.set(0, 0.293, 0);
    group.add(box, flapFront, flapBack, tape);
  } else if (item.shape === "can") {
    const canMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd8a21d, metalness: 0.84, roughness: 0.18, clearcoat: 0.42, clearcoatRoughness: 0.12 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.78, 48), canMaterial);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.274, 0.274, 0.035, 48), new THREE.MeshPhysicalMaterial({ color: 0xe8ece8, metalness: 0.86, roughness: 0.15 }));
    const bottom = top.clone();
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.014, 8, 48), top.material);
    const bottomRim = topRim.clone();
    const pullTab = makeDetailPlane(0.22, 0.08, 0xbfc8c2, { opacity: 0.95 });
    const labelStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.272, 0.272, 0.22, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    top.position.y = 0.407;
    bottom.position.y = -0.407;
    topRim.rotation.x = Math.PI / 2;
    bottomRim.rotation.x = Math.PI / 2;
    topRim.position.y = 0.43;
    bottomRim.position.y = -0.43;
    pullTab.rotation.x = -Math.PI / 2;
    pullTab.position.set(0.03, 0.429, 0);
    labelStripe.position.y = -0.02;
    group.add(body, top, bottom, topRim, bottomRim, pullTab, labelStripe);
  } else if (item.shape === "wrapper") {
    const wrapperMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe84f3f, metalness: 0.18, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 });
    const shape = new THREE.Shape();
    shape.moveTo(-0.58, -0.22);
    shape.lineTo(-0.44, -0.27);
    shape.lineTo(-0.16, -0.23);
    shape.lineTo(0.12, -0.27);
    shape.lineTo(0.56, -0.2);
    shape.lineTo(0.48, 0.22);
    shape.lineTo(0.18, 0.26);
    shape.lineTo(-0.08, 0.22);
    shape.lineTo(-0.36, 0.27);
    shape.lineTo(-0.58, 0.18);
    shape.lineTo(-0.64, -0.02);
    shape.lineTo(-0.58, -0.22);
    const wrapper = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 }),
      wrapperMaterial
    );
    wrapper.rotation.x = -Math.PI / 2;

    const leftCrimp = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.36, 4),
      new THREE.MeshPhysicalMaterial({ color: 0xffc72c, metalness: 0.12, roughness: 0.48, clearcoat: 0.35 })
    );
    const rightCrimp = leftCrimp.clone();
    leftCrimp.scale.set(1, 0.42, 0.8);
    rightCrimp.scale.set(1, 0.42, 0.8);
    leftCrimp.position.set(-0.58, 0.02, -0.02);
    rightCrimp.position.set(0.58, 0.02, 0.02);
    leftCrimp.rotation.set(0, 0, -Math.PI / 2);
    rightCrimp.rotation.set(0, 0, Math.PI / 2);

    const topRidge = makeDetailPlane(0.82, 0.045, 0xff685f, { opacity: 0.92 });
    const centerShine = makeDetailPlane(0.42, 0.04, 0xffffff, { opacity: 0.42 });
    const logoPatch = makeDetailPlane(0.25, 0.18, 0xffd34d, { opacity: 0.95 });
    const creaseA = makeDetailPlane(0.38, 0.022, 0xb5161b, { opacity: 0.36 });
    const creaseB = makeDetailPlane(0.3, 0.018, 0xffffff, { opacity: 0.3 });
    [topRidge, centerShine, logoPatch, creaseA, creaseB].forEach((detail) => {
      detail.rotation.x = -Math.PI / 2;
      detail.position.y = 0.052;
    });
    topRidge.position.set(-0.02, 0.052, -0.18);
    centerShine.position.set(-0.08, 0.054, 0.02);
    centerShine.rotation.z = -0.08;
    logoPatch.position.set(0.3, 0.056, 0.02);
    logoPatch.rotation.z = 0.28;
    creaseA.position.set(-0.16, 0.055, 0.14);
    creaseA.rotation.z = 0.22;
    creaseB.position.set(0.12, 0.057, -0.1);
    creaseB.rotation.z = -0.18;

    const wrapperGroup = new THREE.Group();
    wrapperGroup.add(wrapper, leftCrimp, rightCrimp, topRidge, centerShine, logoPatch, creaseA, creaseB);
    wrapperGroup.rotation.set(0.14, 0.36, -0.12);
    group.add(wrapperGroup);
  } else if (item.shape === "food") {
    const peel = new THREE.Mesh(new THREE.TorusKnotGeometry(0.24, 0.07, 80, 10), material);
    peel.rotation.set(0.4, 0.2, 0.7);
    group.add(peel);
  } else {
    const crumple = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38), material);
    crumple.scale.set(1.1, 0.78, 1);
    group.add(crumple);
  }

  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(1.08, 24, 16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitArea.name = "drag-hit-area";
  hitArea.userData.isHitArea = true;
  group.add(hitArea);

  group.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = !child.userData.isHitArea;
    child.receiveShadow = !child.userData.isHitArea;
  });
  group.scale.setScalar(1.55);
  group.position.set(0, 1.7, 1.35);

  const label = makeTextSprite(item.name, "#10251d", { width: 2.35, height: 0.54, fontSize: 36 });
  label.position.set(0, 0.92, 0);
  group.add(label);

  return group;
};

const initThreeGame = () => {
  const mount = document.querySelector("#threeGame");
  if (!mount || mount.dataset.ready) return;
  if (mount.clientWidth < 20 || mount.clientHeight < 20) {
    window.requestAnimationFrame(initThreeGame);
    return;
  }
  mount.dataset.ready = "true";

  const items = JSON.parse(mount.dataset.items);
  const itemBadge = document.querySelector("#gameItemBadge");
  let activeItem = null;
  let lastItemId = null;
  let dragging = false;
  let animationId = null;
  let useComposer = true;
  const gameWidth = () => Math.max(320, mount.clientWidth || mount.getBoundingClientRect().width || 640);
  const gameHeight = () => Math.max(320, mount.clientHeight || mount.getBoundingClientRect().height || 480);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f8ec);

  const camera = new THREE.PerspectiveCamera(48, gameWidth() / gameHeight(), 0.1, 100);
  camera.position.set(0, 4.2, 7.2);
  camera.lookAt(0, 1.25, 0.25);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(gameWidth(), gameHeight(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cursor = "grab";
  renderer.domElement.style.touchAction = "none";
  mount.appendChild(renderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const environmentFallback = new THREE.Scene();
  environmentFallback.background = new THREE.Color(0xf1f8ec);
  scene.environment = pmremGenerator.fromScene(environmentFallback, 0.04).texture;
  fetch("/images/studio-small.hdr", { method: "HEAD" })
    .then((response) => {
      if (!response.ok || !mount.isConnected) return;
      new RGBELoader().load("/images/studio-small.hdr", (texture) => {
        if (!mount.isConnected) {
          texture.dispose();
          return;
        }
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        scene.environment = envMap;
        texture.dispose();
      });
    })
    .catch(() => {});

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7d8aa, 0.92));

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.9);
  directionalLight.position.set(-3.8, 6.2, 4.4);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 18;
  directionalLight.shadow.camera.left = -7;
  directionalLight.shadow.camera.right = 7;
  directionalLight.shadow.camera.top = 7;
  directionalLight.shadow.camera.bottom = -7;
  scene.add(directionalLight);

  const rectLight = new THREE.RectAreaLight(0xfff5cf, 0.72, 5.6, 2.4);
  rectLight.position.set(0, 4.8, 3.2);
  rectLight.lookAt(0, 0.7, 0);
  scene.add(rectLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshPhysicalMaterial({ color: 0xdff4d5, metalness: 0.08, roughness: 0.26 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(gameWidth(), gameHeight()), 0.035, 0.28, 0.92);
  composer.addPass(bloomPass);
  const smaaPass = new SMAAPass(gameWidth() * renderer.getPixelRatio(), gameHeight() * renderer.getPixelRatio());
  composer.addPass(smaaPass);

  const binConfigs = [
    { type: "Paper", color: 0x1f5d99 },
    { type: "Plastic", color: 0x1f7a45 },
    { type: "Aluminium", color: 0xd8a21d },
    { type: "General Waste", color: 0x2b2f32 },
  ];
  const bins = [
    createBin({ ...binConfigs[0], x: -3.6 }),
    createBin({ ...binConfigs[1], x: -1.2 }),
    createBin({ ...binConfigs[2], x: 1.2 }),
    createBin({ ...binConfigs[3], x: 3.6 }),
  ];
  bins.forEach((bin) => scene.add(bin));

  const updateGameLayout = () => {
    const width = gameWidth();
    const height = gameHeight();
    const aspect = width / Math.max(height, 1);
    const compact = width < 560;
    const tablet = width >= 560 && width < 900;
    const spacing = compact ? 1.38 : tablet ? 1.92 : 2.42;
    const scale = compact ? 0.72 : tablet ? 0.9 : 1.12;
    const positions = [-1.5, -0.5, 0.5, 1.5].map((value) => value * spacing);

    bins.forEach((bin, index) => {
      bin.position.x = positions[index];
      bin.scale.setScalar(scale);
    });

    camera.fov = compact ? 60 : tablet ? 54 : 48;
    camera.position.set(0, compact ? 4.9 : 4.2, compact || aspect < 1 ? 8.4 : 7.2);
    camera.lookAt(0, compact ? 1.4 : 1.25, 0.25);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.7);
  const hitPoint = new THREE.Vector3();

  const setPointer = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const spawnItem = () => {
    if (activeItem) scene.remove(activeItem);
    const availableItems = items.length > 1
      ? items.filter((candidate) => candidate.id !== lastItemId)
      : items;
    const item = availableItems[Math.floor(Math.random() * availableItems.length)];
    lastItemId = item.id;
    if (itemBadge) itemBadge.textContent = `Drag: ${item.name}`;
    activeItem = createRubbish(item);
    scene.add(activeItem);
  };

  const checkDrop = () => {
    const closest = bins.reduce((best, bin) => {
      const distance = Math.hypot(activeItem.position.x - bin.position.x, activeItem.position.z - bin.position.z);
      return distance < best.distance ? { bin, distance } : best;
    }, { bin: null, distance: Infinity });

    if (closest.distance > 1.85) {
      showToast("Drop the item closer to a bin.");
      activeItem.position.set(0, 1.7, 1.35);
      return;
    }

    const result = learningService.submitGame(activeItem.userData.item.id, closest.bin.userData.type);
    showToast(result.message);
    spawnItem();
  };

  const onPointerDown = (event) => {
    if (!activeItem) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(activeItem, true);
    if (hits.length === 0) return;
    dragging = true;
    renderer.domElement.style.cursor = "grabbing";
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(dragPlane, hitPoint);
    activeItem.position.set(
      THREE.MathUtils.clamp(hitPoint.x, -4.2, 4.2),
      1.7,
      THREE.MathUtils.clamp(hitPoint.z, -0.7, 1.75)
    );
  };

  const onPointerUp = (event) => {
    if (!dragging) return;
    dragging = false;
    renderer.domElement.style.cursor = "grab";
    if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    checkDrop();
  };

  const onPointerCancel = (event) => {
    dragging = false;
    renderer.domElement.style.cursor = "grab";
    if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  const onResize = () => {
    if (!mount.isConnected) return;
    updateGameLayout();
    renderer.setSize(gameWidth(), gameHeight(), false);
    composer.setSize(gameWidth(), gameHeight());
    smaaPass.setSize(gameWidth() * renderer.getPixelRatio(), gameHeight() * renderer.getPixelRatio());
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("resize", onResize);

  updateGameLayout();
  onResize();
  spawnItem();

  const animate = () => {
    animationId = window.requestAnimationFrame(animate);
    if (activeItem && !dragging) activeItem.rotation.y += 0.012;
    try {
      if (useComposer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    } catch {
      useComposer = false;
      renderer.render(scene, camera);
    }
  };
  animate();

  threeGameCleanup = () => {
    window.cancelAnimationFrame(animationId);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
    renderer.dispose();
    composer.dispose();
    pmremGenerator.dispose();
    mount.replaceChildren();
  };
};

const stopScanner = async ({ silent = false } = {}) => {
  const reader = document.querySelector("#qrReader");
  const launcher = document.querySelector("#scannerLaunch");
  const actionStack = document.querySelector(".scanner-action-stack");
  const actions = document.querySelector("#scannerActions");

  const restoreScannerUi = () => {
    reader?.classList.add("hidden");
    launcher?.classList.remove("hidden");
    actionStack?.classList.remove("hidden");
    actions?.classList.add("hidden");
  };

  if (!qrScanner) {
    qrScanBusy = false;
    restoreScannerUi();
    return;
  }

  try {
    await qrScanner.stop();
    qrScanner.clear();
    qrScanner = null;
    qrScanBusy = false;
    restoreScannerUi();
    if (!silent) showToast("QR scanner stopped.");
  } catch {
    qrScanner = null;
    qrScanBusy = false;
    restoreScannerUi();
  }
};

const startScanner = async () => {
  const reader = document.querySelector("#qrReader");
  const launcher = document.querySelector("#scannerLaunch");
  const actionStack = document.querySelector(".scanner-action-stack");
  const actions = document.querySelector("#scannerActions");
  if (!reader) return;

  if (!window.isSecureContext) {
    showToast("Camera scanning needs HTTPS or 127.0.0.1/localhost.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("This browser does not support camera scanning.");
    return;
  }

  if (qrScanner) await stopScanner();
  qrScanBusy = false;
  reader.classList.remove("hidden");
  launcher?.classList.add("hidden");
  actionStack?.classList.add("hidden");
  actions?.classList.remove("hidden");
  qrScanner = new Html5Qrcode("qrReader");
  const onScanSuccess = async (decodedText) => {
    if (qrScanBusy) return;
    qrScanBusy = true;
    showToast("QR detected.");
    await stopScanner({ silent: true });
    const handled = handleQrScan(decodedText, { updateUrl: true });
    if (!handled && state.page === "scan") {
      window.setTimeout(() => {
        void startScanner();
      }, 450);
    }
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
    const cameras = await Html5Qrcode.getCameras();
    if (cameras?.length) {
      const rearCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
      await qrScanner.start((rearCamera || cameras[0]).id, scanConfig, onScanSuccess);
      return;
    }
    await qrScanner.start({ facingMode: "environment" }, scanConfig, onScanSuccess);
  } catch (firstError) {
    try {
      await qrScanner.start({ facingMode: "user" }, scanConfig, onScanSuccess);
    } catch (error) {
      qrScanner = null;
      qrScanBusy = false;
      reader.classList.add("hidden");
      launcher?.classList.remove("hidden");
      actionStack?.classList.remove("hidden");
      actions?.classList.add("hidden");
      const message = error?.message || firstError?.message
        ? `Camera scanner could not start: ${error?.message || firstError?.message}`
        : "Camera scanner could not start. Please allow camera access.";
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
  const register = () => {
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
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

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
      <div class="install-prompt-actions">
        <button class="primary-btn" data-action="install-pwa">Install</button>
        <button class="install-close-btn" data-action="close-install-prompt" type="button" aria-label="Close install notification">&times;</button>
      </div>
    `;
    document.body.appendChild(prompt);
  }

  prompt.classList.toggle("hidden", !deferredInstallPrompt || installPromptDismissed);
};

const isStandaloneApp = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const canUseInstallPrompt = () =>
  window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const userAgent = () => window.navigator.userAgent || "";
const isAndroidDevice = () => /android/i.test(window.navigator.userAgent);
const isAppleMobileDevice = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isChromiumBrowser = () => /chrome|crios|edg|opr|samsungbrowser/i.test(userAgent());
const isInAppBrowser = () =>
  /FBAN|FBAV|Instagram|Line|MicroMessenger|Twitter|WhatsApp|wv/i.test(userAgent());
const isSafariBrowser = () =>
  /^((?!chrome|crios|fxios|edg|opr|samsungbrowser|android).)*safari/i.test(userAgent());

const waitForInstallPrompt = (timeout = 3500) => {
  if (deferredInstallPrompt) return Promise.resolve(deferredInstallPrompt);
  return new Promise((resolve) => {
    const waiter = (event) => {
      window.clearTimeout(timer);
      if (installPromptWaiter === waiter) installPromptWaiter = null;
      resolve(event);
    };
    const timer = window.setTimeout(() => {
      if (installPromptWaiter === waiter) installPromptWaiter = null;
      resolve(null);
    }, timeout);

    installPromptWaiter = waiter;
  });
};

const installHelpText = () => {
  if (isInAppBrowser()) {
    return "Open EcoCycle in Safari or Chrome first. In-app browsers such as WhatsApp cannot show the real install popup.";
  }

  if (isAppleMobileDevice()) {
    return "On iPhone or iPad, open this site in Safari, tap Share, then choose Add to Home Screen.";
  }

  if (isAndroidDevice()) {
    return "On Android Chrome, tap Install again after the page finishes loading. If the prompt still does not appear, open the browser menu and choose Add to Home screen or Install app.";
  }

  if (!canUseInstallPrompt()) {
    return "Install works after the app is opened from HTTPS or localhost. Start the dev server with localhost, or deploy the site with HTTPS, then tap Install again.";
  }

  return "On desktop Chrome or Edge, click the install icon in the address bar. You can also open the browser menu and choose Install EcoCycle or Install page as app.";
};

const installHelpHtml = () => {
  if (isInAppBrowser()) {
    return isAppleMobileDevice()
      ? `
        <p>WhatsApp and other in-app browsers cannot install web apps directly.</p>
        <ol style="text-align:left">
          <li>Tap the browser options button.</li>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>In Safari, tap <strong>Share</strong>.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
        </ol>
      `
      : `
        <p>WhatsApp and other in-app browsers cannot show the real install popup.</p>
        <ol style="text-align:left">
          <li>Tap the browser options button.</li>
          <li>Open this page in <strong>Chrome</strong>.</li>
          <li>Tap <strong>Install</strong> again, or use Chrome menu &gt; <strong>Install app</strong>.</li>
        </ol>
      `;
  }

  if (isAppleMobileDevice()) {
    return `
      <p>iPhone and iPad do not allow websites to open the install popup directly.</p>
      <ol style="text-align:left">
        <li>Open EcoCycle in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Choose <strong>Add to Home Screen</strong>.</li>
      </ol>
    `;
  }

  if (isAndroidDevice()) {
    return `
      <p>Install EcoCycle as a mobile web app from Chrome.</p>
      <ol style="text-align:left">
        <li>Use Chrome on HTTPS or localhost.</li>
        <li>Tap the browser menu.</li>
        <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      </ol>
    `;
  }

  return `
    <p>Install EcoCycle as a desktop app from Chrome or Edge.</p>
    <ol style="text-align:left">
      <li>Use HTTPS or localhost.</li>
      <li>Click the install icon in the address bar.</li>
      <li>Or open the browser menu and choose <strong>Install EcoCycle</strong>.</li>
    </ol>
  `;
};

const showInstallPrompt = async () => {
  if (isStandaloneApp()) {
    showToast("EcoCycle is already installed.");
    return;
  }

  if (isInAppBrowser() || (isAppleMobileDevice() && isSafariBrowser())) {
    Swal.fire({
      title: "Install EcoCycle",
      html: installHelpHtml(),
      icon: "info",
      confirmButtonText: "Got it",
      confirmButtonColor: "#0b0b0d",
    });
    return;
  }

  if (!deferredInstallPrompt && canUseInstallPrompt() && isChromiumBrowser() && "serviceWorker" in navigator) {
    await navigator.serviceWorker.ready.catch(() => undefined);
    await waitForInstallPrompt();
  }

  if (!deferredInstallPrompt) {
    Swal.fire({
      title: "Install EcoCycle",
      html: installHelpHtml(),
      icon: "info",
      confirmButtonText: "Got it",
      confirmButtonColor: "#0b0b0d",
    });
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === "accepted") showToast("Installing EcoCycle...");
  } catch {
    Swal.fire({
      title: "Install EcoCycle",
      text: installHelpText(),
      icon: "info",
      confirmButtonText: "Got it",
      confirmButtonColor: "#0b0b0d",
    });
  } finally {
    renderInstallPrompt();
  }
};

const initInstallPromptListeners = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installPromptDismissed = false;
    installPromptWaiter?.(event);
    renderInstallPrompt();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    showToast("EcoCycle installed successfully!");
    renderInstallPrompt();
  });
};

const initApp = async () => {
  await initializeDatabase();
  appReady = true;
  initIncomingBinFromUrl();
  initInstallPromptListeners();
  registerServiceWorker();
  render();
};

window.addEventListener("DOMContentLoaded", initApp);
window.addEventListener("click", handleClick);
window.addEventListener("submit", handleSubmit);
window.addEventListener("change", handleChange);
