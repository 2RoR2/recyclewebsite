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

const binZoneCategories = ["Paper", "Plastic", "Aluminium", "General Waste"];

export const wasteCategory = (wasteType) => {
  if (wasteType === "Paper") return "Paper";
  if (wasteType === "Plastic") return "Plastic";
  if (wasteType === "Aluminium" || wasteType === "Aluminium Can") return "Aluminium";
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
    const stationBin = state.bins.find((bin) => bin.qrCode?.startsWith(`${state.pendingStationCode}-`) && bin.accepts === "Paper")
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

    if (!found) return { ok: false, message: "Unable to submit. Please check your email and password." };

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

    if (!name || !email || !password) return { ok: false, message: "Unable to submit. Please complete all required fields." };
    if (name.length < 2) return { ok: false, message: "Unable to submit. Please enter your name." };
    if (!isStrongPassword(password)) {
      return { ok: false, message: "Unable to submit. Password must include uppercase, lowercase, number, and symbol." };
    }
    if (state.users.some((user) => user.email === email)) return { ok: false, message: "Unable to submit. This email is already registered." };

    const user = {
      id: Date.now(),
      name,
      email,
      password,
      role: "user",
      points: 0,
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

  deleteCurrentAccount() {
    const user = currentUser();
    if (!user) return { ok: false, message: "No account is currently logged in." };
    if (user.role === "admin") return { ok: false, message: "Admin accounts must be removed from Manage Users." };

    state.users = state.users.filter((item) => item.id !== user.id);
    state.records = state.records.filter((record) => record.userId !== user.id);
    state.redeemed = state.redeemed.filter((item) => item.userId !== user.id);
    state.learningRecords = state.learningRecords.filter((item) => item.userId !== user.id);
    state.feedback = state.feedback.filter((item) => item.userId !== user.id);
    state.currentUserId = null;
    state.page = "home";
    saveState();
    return { ok: true, message: "Your account has been deleted." };
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
    const placedZone = binZoneCategories.includes(state.sensorCheck?.zone)
      ? state.sensorCheck.zone
      : bin.accepts;
    const expectedCategory = wasteCategory(placedZone);
    const zoneBin = state.bins.find((item) => item.station === bin.station && item.accepts === expectedCategory) || bin;
    const isCorrect = detectedCategory === expectedCategory;
    const points = isCorrect ? 1 : 0;

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
      binId: zoneBin.id,
      bin: zoneBin.name,
      location: zoneBin.location,
      waste: detectedObject,
      expectedWaste: expectedCategory,
      detectedCategory,
      detectedObject,
      placedZone,
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

    state.sensorCheck = { captured: false, confidence: 0 };
    state.aiDetection = null;
    state.autoRecordedDetectionId = null;
    state.locationCheck = { verified: false, distance: null };
    state.page = "points";
    saveState();
    return isCorrect
      ? `${detectedObject} detected as ${detectedCategory}. ${zoneBin.name} matched the placed zone: +1 point.`
      : `${detectedObject} detected as ${detectedCategory}. Placed zone accepts ${expectedCategory}. No points were added.`;
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
  addBin(formData) {
    const station = formData?.get("station")?.trim() || "Custom Station";
    const accepts = formData?.get("accepts")?.trim() || ["Paper", "Plastic", "Aluminium", "General Waste"][state.bins.length % 4];
    const name = formData?.get("name")?.trim() || `${station} ${accepts} Bin`;
    const location = formData?.get("location")?.trim() || "Kuching, Sarawak";
    const status = formData?.get("status")?.trim() || "Available";
    const qrCode = formData?.get("qrCode")?.trim() || `CUS-${Date.now().toString().slice(-5)}`;
    const lat = Number(formData?.get("lat")) || 1.51983;
    const lng = Number(formData?.get("lng")) || 110.351;
    const mapX = Math.min(100, Math.max(0, Number(formData?.get("mapX")) || 50));
    const mapY = Math.min(100, Math.max(0, Number(formData?.get("mapY")) || 50));
    if (state.bins.some((bin) => bin.qrCode === qrCode)) return { ok: false, message: "QR code already exists." };
    const id = `BIN-C${Date.now()}`;
    state.bins.push({
      id,
      station,
      name,
      location,
      status,
      accepts,
      qrCode,
      lat,
      lng,
      mapX,
      mapY,
    });
    saveState();
    return { ok: true, message: "Bin created." };
  },

  updateBinStatus(binId, status) {
    const bin = state.bins.find((item) => item.id === binId);
    if (bin) bin.status = status;
    saveState();
  },

  updateBin(formData) {
    const id = formData.get("binId")?.trim();
    const bin = state.bins.find((item) => item.id === id);
    if (!bin) return { ok: false, message: "Bin not found." };
    const qrCode = formData.get("qrCode")?.trim() || bin.qrCode;
    if (state.bins.some((item) => item.id !== id && item.qrCode === qrCode)) {
      return { ok: false, message: "QR code already exists." };
    }
    bin.station = formData.get("station")?.trim() || bin.station || "Custom Station";
    bin.name = formData.get("name")?.trim() || bin.name;
    bin.location = formData.get("location")?.trim() || bin.location;
    bin.status = formData.get("status")?.trim() || bin.status;
    bin.accepts = formData.get("accepts")?.trim() || bin.accepts;
    bin.qrCode = qrCode;
    bin.lat = Number(formData.get("lat")) || bin.lat;
    bin.lng = Number(formData.get("lng")) || bin.lng;
    bin.mapX = Math.min(100, Math.max(0, Number(formData.get("mapX")) || bin.mapX || 50));
    bin.mapY = Math.min(100, Math.max(0, Number(formData.get("mapY")) || bin.mapY || 50));
    state.records = state.records.map((record) => record.binId === id ? {
      ...record,
      bin: bin.name,
      location: bin.location,
      expectedWaste: bin.accepts,
    } : record);
    saveState();
    return { ok: true, message: "Bin updated." };
  },

  deleteBin(binId) {
    const id = String(binId);
    const bin = state.bins.find((item) => item.id === id);
    if (!bin) return { ok: false, message: "Bin not found." };
    if (state.bins.length <= 1) return { ok: false, message: "At least one bin must remain." };
    state.deletedBinIds = [...new Set([...(state.deletedBinIds || []), id])];
    state.bins = state.bins.filter((item) => item.id !== id);
    state.records = state.records.map((record) => record.binId === id ? {
      ...record,
      bin: `${record.bin} (deleted)`,
    } : record);
    if (state.selectedBinId === id) state.selectedBinId = state.bins[0]?.id || null;
    saveState();
    return { ok: true, message: "Bin deleted." };
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
    const issue = formData.get("issue")?.trim() || "";
    const category = formData.get("category")?.trim() || "General feedback";
    const source = formData.get("source")?.trim() || "Contact form";
    const guestName = formData.get("name")?.trim() || "";
    const guestEmail = formData.get("email")?.trim() || "";
    const user = currentUser();
    if (!issue) return { ok: false, message: "Please write your feedback before sending." };
    state.feedback.unshift({
      id: Date.now(),
      userId: user?.id || null,
      user: user?.name || guestName || "Guest",
      email: user?.email || guestEmail || "Not logged in",
      category,
      source,
      issue,
      status: "Open",
      date: nowLabel(),
    });
    state.form.issue = "";
    saveState();
    return { ok: true, message: "Feedback submitted and saved." };
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
