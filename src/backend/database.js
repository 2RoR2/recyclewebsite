import { loadFirebaseState, queueFirebaseSync } from "./firebaseStore.js";

export const wasteTypes = ["Paper", "Plastic", "Aluminium", "General Waste"];

export const wasteGuide = [
  ["Paper", "PAPER, CARDBOARD, NEWSPAPERS", "Keep paper clean and dry. Flatten cardboard before disposal and avoid food-stained paper."],
  ["Plastic", "PLASTIC BOTTLES, CLEAN CONTAINERS", "Empty, rinse, and dry plastic items before disposal. Avoid food-contaminated or mixed-material plastic."],
  ["Aluminium", "ALUMINIUM CANS, BEVERAGE TINS", "Empty aluminium items before disposal. Avoid food-contaminated or mixed-material items."],
  ["General Waste", "FOOD WRAPPERS, TISSUES, CONTAMINATED PACKAGING", "Use this for dirty, mixed-material, or non-recyclable rubbish that does not belong in Paper, Plastic, or Aluminium bins."],
];

export const gameItems = [
  { id: "g1", name: "Newspaper", bin: "Paper", shape: "paper" },
  { id: "g2", name: "Plastic Bottle", bin: "Plastic", shape: "bottle" },
  { id: "g3", name: "Food Wrapper", bin: "General Waste", shape: "wrapper" },
  { id: "g4", name: "Cardboard Box", bin: "Paper", shape: "box" },
  { id: "g5", name: "Soda Can", bin: "Aluminium", shape: "can" },
  { id: "g6", name: "Used Tissue", bin: "General Waste", shape: "paper" },
];

const storageKey = "recycle-platform-state";

export const collectionLocation = {
  name: "Kuching Recycle Association",
  place: "Jalan Nanas, Kuching",
  address: "Lot 267, No. 10-A, Lorong 4, Nanas Road, 93400 Kuching, Sarawak, Malaysia",
  lat: 1.5491541,
  lng: 110.3345688,
};

const stationLocations = [
  { code: "PEA", name: "Peach Garden", location: "Jalan Song, Kuching", lat: 1.5120, lng: 110.3546, mapX: 59, mapY: 47 },
  { code: "TAB", name: "Tabuan", location: "Tabuan, Kuching", lat: 1.5284, lng: 110.3667, mapX: 61, mapY: 48 },
  { code: "GAL", name: "Galacity", location: "Galacity, Kuching", lat: 1.5119851, lng: 110.3524077, mapX: 57, mapY: 50 },
  { code: "SAR", name: "Saradise", location: "Saradise, Kuching", lat: 1.505577, lng: 110.361176, mapX: 58, mapY: 46 },
  { code: "BTK", name: "Batu Kawa", location: "Batu Kawa, Kuching", lat: 1.5067389, lng: 110.2968331, mapX: 32, mapY: 52 },
  { code: "UNI", name: "UNIMAS", location: "UNIMAS, Samarahan", lat: 1.4932572, lng: 110.3556421, mapX: 73, mapY: 70 },
  { code: "UIT", name: "UiTM Samarahan", location: "UiTM Samarahan Campus", lat: 1.4499216, lng: 110.4241274, mapX: 79, mapY: 72 },
];

const binTypes = [
  { suffix: "PAP", label: "Paper", offset: -0.00012 },
  { suffix: "PLA", label: "Plastic", offset: -0.00004 },
  { suffix: "ALU", label: "Aluminium", offset: 0.00004 },
  { suffix: "GEN", label: "General Waste", offset: 0.00012 },
];

const defaultBins = stationLocations.flatMap((station, stationIndex) =>
  binTypes.map((type, typeIndex) => ({
    id: `BIN-${String(stationIndex * binTypes.length + typeIndex + 1).padStart(3, "0")}`,
    station: station.name,
    name: `${station.name} ${type.label} Bin`,
    location: station.location,
    status: "Available",
    accepts: type.label,
    qrCode: `${station.code}-${type.suffix}`,
    mapX: station.mapX,
    mapY: station.mapY,
    lat: station.lat + type.offset,
    lng: station.lng + type.offset,
  }))
);

const defaultRewards = [
  { id: 1, name: "TNG Reload PIN RM5", points: 50, stock: 180, desc: "Touch 'n Go reload PIN worth RM5.", image: "reloadpinRM5.png" },
  { id: 2, name: "TNG Reload PIN RM10", points: 100, stock: 190, desc: "Touch 'n Go reload PIN worth RM10.", image: "reloadpinRM10.png" },
  { id: 3, name: "TNG Reload PIN RM30", points: 300, stock: 200, desc: "Touch 'n Go reload PIN worth RM30.", image: "reloadpinRM30.png" },
  { id: 4, name: "Electricity Bill Discount 20%", points: 200, stock: 200, desc: "Redeem a 20% discount support voucher for electricity bill payment.", image: "electricalbill.jpeg" },
  { id: 5, name: "Water Bill Discount 20%", points: 200, stock: 200, desc: "Redeem a 20% discount support voucher for water bill payment.", image: "waterbill.jpeg" },
  { id: 6, name: "Emart Cash Voucher RM5", points: 120, stock: 150, desc: "Cash voucher for Emart Supermarket.", image: "emart.jpeg" },
  { id: 7, name: "Rainforest Music Festival Ticket", points: 250, stock: 100, desc: "Entrance ticket for RWMF Sarawak.", image: "rainforest.jpeg" },
];

const defaultState = {
  page: "home",
  authMode: "login",
  currentUserId: null,
  pendingBinId: null,
  pendingStationCode: null,
  selectedBinId: "BIN-001",
  selectedWaste: "Plastic",
  globalSearchTerm: "",
  scanSearchTerm: "",
  collectionFilterText: "",
  collectionFilterStatus: "All",
  historyFilterText: "",
  historyFilterType: "All",
  adminUserFilterText: "",
  selectedManagedUserId: null,
  deletedBinIds: [],
  sensorCheck: { captured: false, confidence: 0 },
  aiDetection: null,
  autoRecordedDetectionId: null,
  locationCheck: { verified: false, distance: null },
  selectedRewardId: null,
  rewardDrafts: {},
  form: { name: "", email: "", password: "", issue: "" },
  newItem: { name: "", points: 5, stock: 10, desc: "", image: "" },
  users: [
    {
      id: 1,
      name: "Aina",
      email: "user@demo.com",
      password: "123456",
      role: "user",
      points: 5,
      avatar: "",
      phone: "",
      location: "Kuching, Sarawak",
      notifications: true,
      privacy: "Public ranking",
    },
    {
      id: 2,
      name: "Admin",
      email: "admin@demo.com",
      password: "admin123",
      role: "admin",
      points: 0,
      avatar: "",
      phone: "",
      location: "Admin Office",
      notifications: true,
      privacy: "Admin only",
    },
  ],
  bins: defaultBins,
  rewards: defaultRewards,
  records: [],
  redeemed: [],
  feedback: [],
  learningRecords: [],
};

const canUseStorage = () => typeof window !== "undefined" && "localStorage" in window;

const normalizeCategoryLabel = (value) => {
  if (value === "Metal" || value === "Aluminium Can") return "Aluminium";
  if (value === "Glass" || value === "E-Waste" || value === "e-waste") return "General Waste";
  return value;
};

const loadState = () => {
  if (!canUseStorage()) return structuredClone(defaultState);

  try {
    const savedState = JSON.parse(window.localStorage.getItem(storageKey));
    if (!savedState) return structuredClone(defaultState);
    return normalizeState({ ...structuredClone(defaultState), ...savedState });
  } catch {
    return structuredClone(defaultState);
  }
};

const normalizeBins = (bins, deletedIds = []) => {
  const defaultIds = new Set(defaultBins.map((bin) => bin.id));
  const deletedBinIds = new Set(deletedIds);
  const removedStationNames = new Set(["Kota Samarahan", "Waterfront", "Tabuan", "Emart Batu Kawa"]);
  const customBins = bins
    .filter((bin) => !defaultIds.has(bin.id) && !removedStationNames.has(bin.station))
    .map((bin) => ({
      ...bin,
      accepts: normalizeCategoryLabel(bin.accepts),
    }));

  return [
    ...defaultBins.filter((defaultBin) => !deletedBinIds.has(defaultBin.id)).map((defaultBin) => {
      const savedBin = bins.find((bin) => bin.id === defaultBin.id);
      return {
        ...defaultBin,
        status: savedBin?.status || defaultBin.status,
      };
    }),
    ...customBins,
  ];
};

const normalizeRewards = (rewards) => {
  const defaultIds = new Set(defaultRewards.map((reward) => String(reward.id)));
  const savedRewardById = new Map((rewards || []).map((reward) => [String(reward.id), reward]));
  const customRewards = rewards
    .filter((reward) => !defaultIds.has(String(reward.id)))
    .map((reward) => ({
      ...reward,
      id: /^\d+$/.test(String(reward.id)) ? Number(reward.id) : reward.id,
    }));

  return [
    ...defaultRewards.map((defaultReward) => ({
      ...defaultReward,
      ...(savedRewardById.get(String(defaultReward.id)) || {}),
      id: defaultReward.id,
    })),
    ...customRewards,
  ];
};

const normalizeState = (loadedState) => {
  const bins = normalizeBins(loadedState.bins, loadedState.deletedBinIds || []);
  const page = loadedState.page === "quiz"
    ? "game"
    : loadedState.page === "manage-quiz"
      ? "admin-dashboard"
      : loadedState.page;

  return {
    ...loadedState,
    page,
    pendingBinId: loadedState.pendingBinId || null,
    pendingStationCode: loadedState.pendingStationCode || null,
    globalSearchTerm: loadedState.globalSearchTerm || "",
    scanSearchTerm: loadedState.scanSearchTerm || "",
    collectionFilterText: loadedState.collectionFilterText || "",
    collectionFilterStatus: loadedState.collectionFilterStatus || "All",
    historyFilterText: loadedState.historyFilterText || "",
    historyFilterType: loadedState.historyFilterType || "All",
    adminUserFilterText: loadedState.adminUserFilterText || "",
    selectedManagedUserId: loadedState.selectedManagedUserId || null,
    deletedBinIds: loadedState.deletedBinIds || [],
    rewardDrafts: loadedState.rewardDrafts || {},
    sensorCheck: loadedState.sensorCheck || { captured: false, confidence: 0 },
    aiDetection: loadedState.aiDetection || null,
    autoRecordedDetectionId: loadedState.autoRecordedDetectionId || null,
    locationCheck: loadedState.locationCheck || { verified: false, distance: null },
    users: loadedState.users.map((user) => {
      const id = /^\d+$/.test(String(user.id)) ? Number(user.id) : user.id;
      return {
        avatar: "",
        phone: "",
        notifications: true,
        privacy: user.role === "admin" ? "Admin only" : "Public ranking",
        ...user,
        id,
        location: user.location === "Main Campus" ? "Kuching, Sarawak" : (user.location || (user.role === "admin" ? "Admin Office" : "Kuching, Sarawak")),
      };
    }),
    bins,
    rewards: normalizeRewards(loadedState.rewards || []),
    records: (loadedState.records || []).map((record) => {
      const matchedBin = bins.find((bin) => bin.id === record.binId)
        || bins.find((bin) => bin.name === record.bin)
        || bins.find((bin) => record.bin?.includes(bin.id));

      if (!matchedBin) return record;

      return {
        ...record,
        binId: matchedBin.id,
        bin: matchedBin.name,
        location: matchedBin.location,
        expectedWaste: matchedBin.accepts,
        detectedCategory: normalizeCategoryLabel(record.detectedCategory),
      };
    }),
    learningRecords: loadedState.learningRecords || [],
    feedback: (loadedState.feedback || []).map((item) => ({
      userId: null,
      email: "Not recorded",
      category: "General feedback",
      source: "Contact form",
      ...item,
    })),
  };
};

export const state = loadState();

export const saveState = () => {
  if (!canUseStorage()) return;

  window.localStorage.setItem(storageKey, JSON.stringify(state));
  queueFirebaseSync(state);
};

export const initializeDatabase = async () => {
  const firebaseState = await loadFirebaseState();
  if (firebaseState) {
    Object.assign(state, normalizeState({ ...structuredClone(defaultState), ...firebaseState }));
    saveState();
    return;
  }

  queueFirebaseSync(state);
};

export const resetState = () => {
  if (canUseStorage()) window.localStorage.removeItem(storageKey);
  Object.assign(state, structuredClone(defaultState));
};
