import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { Chart } from "chart.js/auto";
import { Html5Qrcode } from "html5-qrcode";
import L from "leaflet";
import QRCode from "qrcode";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import * as THREE from "three";
import { collectionLocation, saveState, state } from "./backend/database.js";
import { adminService, authService, currentUser, feedbackService, learningService, recyclingService, rewardService, role } from "./backend/services.js";
import { renderAdminPage } from "./frontend/admin/pages.js";
import { renderGuestPage } from "./frontend/guest/pages.js";
import { renderNav } from "./frontend/shared/navigation.js";
import { renderNotFound } from "./frontend/shared/templates.js";
import { renderUserPage } from "./frontend/user/pages.js";

const app = document.querySelector("#app");
const navLinks = document.querySelector("#navLinks");
const navActions = document.querySelector("#navActions");
const toast = document.querySelector("#toast");
let qrScanner = null;
let reportChart = null;
let threeGameCleanup = null;

const scanUrlForBin = (binId) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("bin", binId);
  return url.toString();
};

const normalizeBinId = (value) => {
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
    if (bin) return normalizeBinId(bin);
  } catch {
    // Plain bin codes are still accepted for older generated QR values.
  }

  return normalizeBinId(text);
};

const handleBinFromQr = (scanValue, { updateUrl = false } = {}) => {
  const binId = binIdFromScanValue(scanValue);
  const bin = state.bins.find((item) => item.id === binId);

  if (!bin) {
    showToast(`Unknown bin QR: ${scanValue}`);
    return false;
  }

  state.selectedBinId = bin.id;
  if (updateUrl) window.history.replaceState({}, "", scanUrlForBin(bin.id));

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
  return true;
};

const showToast = (message) => {
  if (!message) return;
  const errorWords = ["failed", "try again", "wrong", "penalty", "unknown", "not enough", "no points", "could not", "false"];
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
  guest: ["home", "auth", "education", "about", "public-bins", "preview-rewards", "contact"],
  user: ["scan", "locations", "education", "quiz", "game", "learning-records", "select-waste", "points", "penalties", "rewards", "item-detail", "redeem-confirm", "my-redeemed", "collection", "history", "leaderboard", "contact", "profile"],
  admin: ["admin-dashboard", "manage-qr", "manage-bins", "bin-status", "waste-records", "manage-users", "points-management", "penalty-management", "manage-rewards", "manage-quiz", "redemptions", "reports", "feedback-admin", "announcement", "profile"],
};

const pageForRole = () => {
  const activeRole = role();
  if (!routeSets[activeRole].includes(state.page)) return renderNotFound();
  if (role() === "admin") return renderAdminPage();
  if (role() === "user") return renderUserPage();
  return renderGuestPage();
};

const render = () => {
  if (threeGameCleanup) {
    threeGameCleanup();
    threeGameCleanup = null;
  }
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
      showToast("Please login as a user before scanning a bin QR code.");
      state.authMode = "login";
      go("auth");
      return;
    }

    handleBinFromQr(target.dataset.scan, { updateUrl: true });
  }

  if (target.dataset.waste) {
    recyclingService.selectWaste(target.dataset.waste);
    render();
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

  if (target.dataset.deleteReward) {
    adminService.deleteReward(target.dataset.deleteReward);
    render();
  }

  if (target.dataset.deleteQuiz) {
    adminService.deleteQuiz(target.dataset.deleteQuiz);
    render();
  }

  if (target.dataset.redemption) {
    const [id, status] = target.dataset.redemption.split(":");
    adminService.updateRedemption(id, status);
    render();
  }

  if (target.dataset.feedback) {
    adminService.resolveFeedback(target.dataset.feedback);
    render();
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
  if (form.dataset.form === "add-reward") result = { ok: true, message: adminService.addReward(formData) };
  if (form.dataset.form === "add-quiz") result = { ok: true, message: adminService.addQuiz(formData) };
  if (form.dataset.form === "profile") result = authService.updateProfile(formData);
  if (form.dataset.form === "quiz") result = learningService.submitQuiz(formData);

  if (result?.message) showToast(result.message);
  render();
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

const handleChange = (event) => {
  if (event.target.name === "avatar") {
    handleAvatarChange(event.target);
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

  if (event.target.name && state.newQuiz[event.target.name] !== undefined) {
    state.newQuiz[event.target.name] = event.target.value;
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
  const map = L.map(mapElement, { scrollWheelZoom: false }).setView([1.51983, 110.351], 17);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  state.bins.forEach((bin) => {
    const marker = L.marker([bin.lat, bin.lng], {
      icon: L.divIcon({
        className: `leaflet-bin-marker ${bin.status.toLowerCase()}`,
        html: `<span>${bin.id.replace("BIN-", "")}</span>`,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      }),
    }).addTo(map);
    marker.bindPopup(`<strong>${bin.name}</strong><br>${bin.location}<br>${bin.status}`);
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

  L.marker(destination).addTo(map).bindPopup(`<strong>${collectionLocation.name}</strong><br>${collectionLocation.place}`).openPopup();

  const drawRoute = (origin) => {
    L.marker(origin).addTo(map).bindPopup("Your current location");
    L.polyline([origin, destination], { color: "#1f7a45", weight: 5, opacity: 0.82, dashArray: "8 8" }).addTo(map);
    map.fitBounds([origin, destination], { padding: [42, 42] });
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
  document.querySelectorAll("[data-qr-bin]").forEach((canvas) => {
    if (canvas.dataset.ready) return;
    canvas.dataset.ready = "true";
    const scanUrl = scanUrlForBin(canvas.dataset.qrBin);
    QRCode.toCanvas(canvas, scanUrl, { width: 180, margin: 1 });
    const urlLabel = document.querySelector(`[data-qr-url-for="${canvas.dataset.qrBin}"]`);
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
      labels: ["Scans", "Penalties", "Rewards", "Quiz/Game"],
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

const initPagePlugins = () => {
  initLeafletMap();
  initCollectionMap();
  initQrGenerator();
  initReportChart();
  initThreeGame();
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
    Plastic: 0x42b883,
    Paper: 0xe8dca8,
    "General Waste": 0x6f7670,
    Metal: 0xb4c5ce,
    Glass: 0x8fd6d2,
    "Food Waste": 0xc98232,
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
    createBin({ type: "Paper", color: 0xd8b451, x: 0 }),
    createBin({ type: "General Waste", color: 0x59615c, x: 2.4 }),
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
  const actions = document.querySelector("#scannerActions");

  if (!qrScanner) return;

  try {
    await qrScanner.stop();
    qrScanner.clear();
    qrScanner = null;
    reader?.classList.add("hidden");
    launcher?.classList.remove("hidden");
    actions?.classList.add("hidden");
    showToast("QR scanner stopped.");
  } catch {
    qrScanner = null;
    reader?.classList.add("hidden");
    launcher?.classList.remove("hidden");
    actions?.classList.add("hidden");
  }
};

const startScanner = async () => {
  const reader = document.querySelector("#qrReader");
  const launcher = document.querySelector("#scannerLaunch");
  const actions = document.querySelector("#scannerActions");
  if (!reader) return;

  if (qrScanner) await stopScanner();
  reader.classList.remove("hidden");
  launcher?.classList.add("hidden");
  actions?.classList.remove("hidden");
  qrScanner = new Html5Qrcode("qrReader");

  try {
    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        await stopScanner();
        handleBinFromQr(decodedText, { updateUrl: true });
      }
    );
  } catch {
    reader.classList.add("hidden");
    launcher?.classList.remove("hidden");
    actions?.classList.add("hidden");
    showToast("Camera scanner could not start. Please allow camera access or use the scan button.");
  }
};

const initIncomingBinFromUrl = () => {
  const binId = new URLSearchParams(window.location.search).get("bin");
  if (binId) handleBinFromQr(binId);
};

document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("input", handleChange);
document.addEventListener("change", handleChange);

initIncomingBinFromUrl();
render();
