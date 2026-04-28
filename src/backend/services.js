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

const continueToPendingBin = (fallbackPage) => {
  if (state.pendingBinId && state.bins.some((bin) => bin.id === state.pendingBinId)) {
    state.selectedBinId = state.pendingBinId;
    state.pendingBinId = null;
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
      location: "Main Campus",
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
    const privacy = formData.get("privacy");
    const emailTaken = state.users.some((item) => item.id !== user.id && item.email === email);

    if (!name || !email) return { ok: false, message: "Name and email cannot be empty." };
    if (emailTaken) return { ok: false, message: "That email is already used by another account." };

    user.name = name;
    user.email = email;
    user.phone = phone;
    user.location = location;
    user.privacy = privacy;
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
    const isCorrect = bin.accepts === state.selectedWaste;
    const points = isCorrect ? 1 : -1;

    state.records.unshift({
      id: Date.now(),
      userId: user.id,
      user: user.name,
      binId: bin.id,
      bin: bin.name,
      location: bin.location,
      waste: state.selectedWaste,
      expectedWaste: bin.accepts,
      points,
      status: isCorrect ? "Valid" : "Wrong Bin",
      date: nowLabel(),
    });

    user.points = Math.max(0, user.points + points);
    if (!isCorrect) user.penalties += 1;

    state.page = "points";
    saveState();
    return isCorrect
      ? `${state.selectedWaste} matched ${bin.name}. Rubbish recorded: +1 point.`
      : `${bin.name} only accepts ${bin.accepts}. Wrong bin recorded: -1 point.`;
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
    state.redeemed.unshift({
      id: Date.now(),
      userId: user.id,
      user: user.name,
      item: reward.name,
      points: reward.points,
      status: "Pending",
      code: `COL-${String(Date.now()).slice(-5)}`,
      date: nowLabel(),
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
      location: "Near i-CATS Kuching",
      status: "Available",
      accepts: ["Plastic", "Paper", "General Waste", "Metal", "Glass"][state.bins.length % 5],
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

  addReward(formData) {
    const name = formData.get("name").trim();
    if (!name) return;
    state.rewards.push({
      id: Date.now(),
      name,
      points: Number(formData.get("points")),
      stock: Number(formData.get("stock")),
      desc: "Admin-added reward item.",
    });
    state.newItem = { name: "", points: 5, stock: 10 };
    saveState();
  },

  deleteReward(rewardId) {
    state.rewards = state.rewards.filter((reward) => reward.id !== Number(rewardId));
    saveState();
  },

  addQuiz(formData) {
    const question = formData.get("question").trim();
    const options = [formData.get("option1").trim(), formData.get("option2").trim(), formData.get("option3").trim()];
    const answer = formData.get("answer").trim();

    if (!question || options.some((option) => !option) || !answer) {
      return "Please fill in the question, three options, and the correct answer.";
    }

    state.quizQuestions.push({
      id: `q${Date.now()}`,
      question,
      options,
      answer,
    });
    state.newQuiz = { question: "", option1: "", option2: "", option3: "", answer: "" };
    saveState();
    return "Quiz question added.";
  },

  deleteQuiz(questionId) {
    state.quizQuestions = state.quizQuestions.filter((question) => question.id !== questionId);
    saveState();
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
  submitQuiz(formData) {
    const user = currentUser();
    const score = state.quizQuestions.reduce((total, question) => {
      return total + (formData.get(question.id) === question.answer ? 1 : 0);
    }, 0);
    const points = score === state.quizQuestions.length ? 2 : score > 0 ? 1 : 0;

    if (points > 0) user.points += points;

    state.learningRecords.unshift({
      id: Date.now(),
      userId: user.id,
      user: user.name,
      type: "Quiz",
      score,
      total: state.quizQuestions.length,
      points,
      date: nowLabel(),
    });
    saveState();

    return {
      ok: true,
      message: `Quiz recorded. Score ${score}/${state.quizQuestions.length}. ${points > 0 ? `+${points} point${points > 1 ? "s" : ""}` : "No points this time"}.`,
    };
  },

  submitGame(itemId, bin) {
    const user = currentUser();
    const item = gameItems.find((entry) => entry.id === itemId);
    const correct = item?.bin === bin;
    const points = correct ? 1 : 0;

    if (points > 0) user.points += points;

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
      message: correct ? `Correct. ${item.name} goes to ${bin}. +1 point.` : `Try again. ${item?.name || "This item"} should go to ${item?.bin || "the correct bin"}.`,
    };
  },
};
