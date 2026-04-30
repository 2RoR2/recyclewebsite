import { gameItems, saveState, state } from "./database.js";

export const currentUser = () => state.users.find((user) => user.id === state.currentUserId) || null;
export const role = () => currentUser()?.role || "guest";
export const selectedBin = () => state.bins.find((bin) => bin.id === state.selectedBinId) || state.bins[0];
export const selectedReward = () => state.rewards.find((reward) => reward.id === state.selectedRewardId);
export const userRecords = () => state.records.filter((record) => record.userId === state.currentUserId);
export const userRedeemed = () => state.redeemed.filter((item) => item.userId === state.currentUserId);
export const userLearningRecords = () => state.learningRecords.filter((item) => item.userId === state.currentUserId);

const nowLabel = () =>
  new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

export const wasteCategory = (wasteType) => {
  if (wasteType === "Plastic") return "Plastic";
  if (wasteType === "Paper") return "Paper";
  return "General Waste";
};

const isStrongPassword = (password) =>
  password.length >= 8
  && /[A-Z]/.test(password)
  && /[a-z]/.test(password)
  && /\d/.test(password)
  && /[^A-Za-z0-9]/.test(password);

const continueToPendingBin = (fallbackPage) => {
  if (state.pendingStationCode) {
    const stationBin = state.bins.find((bin) => bin.qrCode?.startsWith(`${state.pendingStationCode}-`) && bin.accepts === "Plastic")
      || state.bins.find((bin) => bin.qrCode?.startsWith(`${state.pendingStationCode}-`));
    if (stationBin) {
      state.selectedBinId = stationBin.id;
      state.pendingStationCode = null;
      state.pendingBinId = null;
      state.sensorCheck = { captured: false, confidence: 0 };
      state.aiDetection = null;
      state.autoRecordedDetectionId = null;
      state.locationCheck = { verified: false, distance: null };
      state.page = "select-waste";
      return;
    }
  }

  if (state.pendingBinId && state.bins.some((bin) => bin.id === state.pendingBinId)) {
    state.selectedBinId = state.pendingBinId;
    state.pendingBinId = null;
    state.sensorCheck = { captured: false, confidence: 0 };
    state.aiDetection = null;
    state.autoRecordedDetectionId = null;
    state.locationCheck = { verified: false, distance: null };
    state.page = "select-waste";
    return;
  }

  state.page = fallbackPage;
};

export const authService = {
  login(formData) {
    const email = formData.get("email").trim();
    const password = formData.get("password");
    const found = state.users.find((user) => user.email === email && user.password === password);

    if (!found) return { ok: false, message: "Login failed. Try user@demo.com / 123456 or admin@demo.com / admin123." };

    state.currentUserId = found.id;
    state.form = { name: "", email: "", password: "", issue: "" };
    if (found.role === "admin") state.page = "admin-dashboard";
    else continueToPendingBin("scan");
    saveState();
    return { ok: true };
  },

  register(formData) {
    const name = formData.get("name").trim();
    const email = formData.get("email").trim();
    const password = formData.get("password");

    if (!name || !email || !password) return { ok: false, message: "Please fill in name, email, and password." };
    if (name.length < 2) return { ok: false, message: "Username must be at least 2 characters so admins can identify your records." };
    if (!isStrongPassword(password)) {
      return { ok: false, message: "Use a stronger password: at least 8 characters with uppercase, lowercase, number, and symbol." };
    }
    if (state.users.some((user) => user.email === email)) return { ok: false, message: "That email is already registered." };

    const user = {
      id: Date.now(),
      name,
      email,
      password,
      role: "user",
      points: 0,
      penalties: 0,
      avatar: "",
      phone: "",
      location: "Kuching, Sarawak",
      notifications: true,
      privacy: "Public ranking",
    };
    state.users.push(user);
    state.currentUserId = user.id;
    state.form = { name: "", email: "", password: "", issue: "" };
    continueToPendingBin("scan");
    saveState();
    return { ok: true };
  },

  logout() {
    state.currentUserId = null;
    state.page = "home";
    saveState();
  },

  updateProfile(formData) {
    const user = currentUser();
    const name = formData.get("name").trim();
    const email = formData.get("email").trim();
    const password = formData.get("password");
    const phone = formData.get("phone").trim();
    const location = formData.get("location").trim();
    const emailTaken = state.users.some((item) => item.id !== user.id && item.email === email);

    if (!name || !email) return { ok: false, message: "Name and email cannot be empty." };
    if (emailTaken) return { ok: false, message: "That email is already used by another account." };

    user.name = name;
    user.email = email;
    user.phone = phone;
    user.location = location;
    user.notifications = formData.get("notifications") === "on";
    if (password) user.password = password;

    state.records = state.records.map((record) =>
      record.userId === user.id ? { ...record, user: user.name } : record
    );
    state.redeemed = state.redeemed.map((item) =>
      item.userId === user.id ? { ...item, user: user.name } : item
    );

    saveState();
    return { ok: true, message: "Profile updated." };
  },
};

export const recyclingService = {
  selectBin(binId) {
    if (!state.bins.some((bin) => bin.id === binId)) return false;
    state.selectedBinId = binId;
    state.pendingStationCode = null;
    state.sensorCheck = { captured: false, confidence: 0 };
    state.aiDetection = null;
    state.locationCheck = { verified: false, distance: null };
    state.page = "select-waste";
    saveState();
    return true;
  },

  selectWaste(wasteType) {
    state.selectedWaste = wasteType;
    saveState();
  },

  recordWaste() {
    const user = currentUser();
    const bin = selectedBin();
    const detectedCategory = state.aiDetection?.category || wasteCategory(state.selectedWaste);
    const detectedObject = state.aiDetection?.label || state.selectedWaste;
    const isCorrect = bin.accepts === detectedCategory;
    const points = isCorrect ? 1 : -1;

    if (!state.locationCheck?.verified) {
      return "Location verification missing. Please verify GPS near the scanned bin before recording disposal.";
    }

    if (!state.sensorCheck?.captured) {
      return "Camera check missing. Please use the device camera check before recording disposal.";
    }

    state.records.unshift({
      id: Date.now(),
      userId: user.id,
      user: user.name,
      binId: bin.id,
      bin: bin.name,
      location: bin.location,
      waste: detectedObject,
      expectedWaste: bin.accepts,
      detectedCategory,
      detectedObject,
      presenceDetected: state.sensorCheck.presenceDetected ?? true,
      locationVerified: state.locationCheck.verified,
      distanceMeters: state.locationCheck.distance,
      detectionError: isCorrect ? 0 : 1,
      boundingBox: state.aiDetection?.box || null,
      verification: `GPS ${state.locationCheck.distance}m, YOLO ${state.sensorCheck.confidence}% confidence`,
      points,
      status: isCorrect ? "Valid" : "Wrong Bin",
      date: nowLabel(),
    });

    user.points = Math.max(0, user.points + points);
    if (!isCorrect) user.penalties += 1;

    state.sensorCheck = { captured: false, confidence: 0 };
    state.aiDetection = null;
    state.autoRecordedDetectionId = null;
    state.locationCheck = { verified: false, distance: null };
    state.page = "points";
    saveState();
    return isCorrect
      ? `${detectedObject} detected as ${detectedCategory}. ${bin.name} matched: +1 point.`
      : `${detectedObject} detected as ${detectedCategory}. ${bin.name} only accepts ${bin.accepts}: false, -1 point.`;
  },
};

export const rewardService = {
  selectReward(rewardId) {
    state.selectedRewardId = Number(rewardId);
    state.page = "item-detail";
    saveState();
  },

  redeemReward(rewardId) {
    const user = currentUser();
    const reward = state.rewards.find((item) => item.id === Number(rewardId));

    if (!reward || user.points < reward.points || reward.stock < 1) {
      return { ok: false, message: "Not enough points or item is out of stock." };
    }

    user.points -= reward.points;
    reward.stock -= 1;
    const redeemedAtMs = Date.now();
    const expiresAtMs = redeemedAtMs + (1000 * 60 * 60 * 24 * 30);
    state.redeemed.unshift({
      id: redeemedAtMs,
      userId: user.id,
      user: user.name,
      item: reward.name,
      points: reward.points,
      status: "Pending",
      code: `COL-${String(Date.now()).slice(-5)}`,
      date: nowLabel(),
      redeemedAtMs,
      expiresAtMs,
    });
    state.page = "my-redeemed";
    saveState();
    return { ok: true, message: "Redemption request sent to admin." };
  },
};

export const adminService = {
  addBin() {
    const id = `BIN-${String(state.bins.length + 1).padStart(3, "0")}`;
    const offset = state.bins.length * 0.00018;
    state.bins.push({
      id,
      name: `New Smart Bin ${state.bins.length + 1}`,
      location: "Kuching, Sarawak",
      status: "Available",
      accepts: ["Plastic", "Paper", "General Waste"][state.bins.length % 3],
      lat: 1.51983 + offset,
      lng: 110.351 + offset,
      mapX: 50,
      mapY: 50,
    });
    saveState();
  },

  updateBinStatus(binId, status) {
    const bin = state.bins.find((item) => item.id === binId);
    if (bin) bin.status = status;
    saveState();
  },

  adjustPoints(userId, amount) {
    const user = state.users.find((item) => item.id === Number(userId));
    if (user) user.points = Math.max(0, user.points + Number(amount));
    saveState();
  },

  addUser(formData) {
    const name = formData.get("name")?.trim();
    const email = formData.get("email")?.trim();
    const password = formData.get("password")?.trim();
    const location = formData.get("location")?.trim() || "Kuching, Sarawak";
    if (!name || !email || !password) return { ok: false, message: "Name, email, and password are required." };
    if (state.users.some((user) => user.email === email)) return { ok: false, message: "Email already exists." };

    const user = {
      id: Date.now(),
      name,
      email,
      password,
      role: "user",
      points: 0,
      penalties: 0,
      avatar: "",
      phone: "",
      location,
      notifications: true,
      privacy: "Public ranking",
    };
    state.users.push(user);
    state.selectedManagedUserId = user.id;
    saveState();
    return { ok: true, message: "User added successfully." };
  },

  editUserByAdmin(formData) {
    const id = Number(formData.get("userId"));
    const user = state.users.find((item) => item.id === id && item.role === "user");
    if (!user) return { ok: false, message: "User not found." };

    const name = formData.get("name")?.trim();
    const email = formData.get("email")?.trim();
    const location = formData.get("location")?.trim() || "Kuching, Sarawak";
    const password = formData.get("password")?.trim();
    if (!name || !email) return { ok: false, message: "Name and email are required." };
    if (state.users.some((item) => item.id !== id && item.email === email)) {
      return { ok: false, message: "Email already exists." };
    }

    user.name = name;
    user.email = email;
    user.location = location;
    if (password) user.password = password;

    state.records = state.records.map((record) => (record.userId === id ? { ...record, user: name } : record));
    state.redeemed = state.redeemed.map((item) => (item.userId === id ? { ...item, user: name } : item));
    state.feedback = state.feedback.map((item) => (item.userId === id ? { ...item, user: name, email } : item));
    saveState();
    return { ok: true, message: "User updated." };
  },

  deleteUser(userId) {
    const id = Number(userId);
    const target = state.users.find((user) => user.id === id);
    if (!target || target.role !== "user") return { ok: false, message: "User not found." };

    state.users = state.users.filter((user) => user.id !== id);
    state.records = state.records.filter((record) => record.userId !== id);
    state.redeemed = state.redeemed.filter((item) => item.userId !== id);
    state.learningRecords = state.learningRecords.filter((item) => item.userId !== id);
    state.feedback = state.feedback.filter((item) => item.userId !== id);
    if (state.selectedManagedUserId === id) state.selectedManagedUserId = null;
    saveState();
    return { ok: true, message: "User deleted." };
  },

  addReward(formData) {
    const name = formData.get("name").trim();
    const points = Number(formData.get("points"));
    const stock = Number(formData.get("stock"));
    if (!name) return { ok: false, message: "Item name is required." };
    if (!Number.isFinite(points) || points < 1) return { ok: false, message: "Points must be 1 or more." };
    if (!Number.isFinite(stock) || stock < 0) return { ok: false, message: "Quantity cannot be negative." };
    const desc = formData.get("desc")?.trim() || "Admin-added reward item.";
    if (state.rewards.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, message: "Reward item name already exists." };
    }
    state.rewards.push({
      id: Date.now(),
      name,
      points: Math.floor(points),
      stock: Math.floor(stock),
      desc,
      image: state.newItem.image || "",
    });
    state.newItem = { name: "", points: 5, stock: 10, desc: "", image: "" };
    saveState();
    return { ok: true, message: "Reward item added." };
  },

  deleteReward(rewardId) {
    const id = Number(rewardId);
    const before = state.rewards.length;
    state.rewards = state.rewards.filter((reward) => reward.id !== id);
    saveState();
    return before === state.rewards.length
      ? { ok: false, message: "Reward item not found." }
      : { ok: true, message: "Reward item deleted." };
  },

  updateRewardStock(rewardId, stock) {
    const reward = state.rewards.find((item) => item.id === Number(rewardId));
    if (!reward) return { ok: false, message: "Reward item not found." };
    reward.stock = Math.max(0, Number(stock) || 0);
    saveState();
    return { ok: true, message: "Reward quantity updated." };
  },

  updateRewardPoints(rewardId, points) {
    const reward = state.rewards.find((item) => item.id === Number(rewardId));
    if (!reward) return { ok: false, message: "Reward item not found." };
    const parsed = Number(points);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return { ok: false, message: "Points must be 1 or more." };
    }
    reward.points = Math.floor(parsed);
    saveState();
    return { ok: true, message: "Reward points updated." };
  },

  updateRewardImage(rewardId, image) {
    const reward = state.rewards.find((item) => item.id === Number(rewardId));
    if (!reward) return { ok: false, message: "Reward item not found." };
    reward.image = image || "";
    saveState();
    return { ok: true, message: "Reward image updated." };
  },

  updateRedemption(id, status) {
    const item = state.redeemed.find((request) => request.id === Number(id));
    if (item) item.status = status;
    saveState();
  },

  resolveFeedback(id) {
    const item = state.feedback.find((entry) => entry.id === Number(id));
    if (item) item.status = "Resolved";
    saveState();
  },
};

export const feedbackService = {
  submitFeedback(formData) {
    const issue = formData.get("issue").trim();
    const user = currentUser();
    if (!issue) return;
    state.feedback.unshift({
      id: Date.now(),
      userId: user?.id || null,
      user: user?.name || "Guest",
      email: user?.email || "Not logged in",
      issue,
      status: "Open",
      date: nowLabel(),
    });
    state.form.issue = "";
    saveState();
    return "Feedback submitted.";
  },
};

export const learningService = {
  submitGame(itemId, bin) {
    const user = currentUser();
    const item = gameItems.find((entry) => entry.id === itemId);
    const correct = item?.bin === bin;
    const points = 0;

    state.learningRecords.unshift({
      id: Date.now(),
      userId: user.id,
      user: user.name,
      type: "Sorting Game",
      item: item?.name || "Unknown item",
      answer: bin,
      correctAnswer: item?.bin || "",
      score: correct ? 1 : 0,
      total: 1,
      points,
      date: nowLabel(),
    });
    saveState();

    return {
      ok: correct,
      message: correct ? `Correct. ${item.name} goes to ${bin}.` : `Try again. ${item?.name || "This item"} should go to ${item?.bin || "the correct bin"}.`,
    };
  },
};
