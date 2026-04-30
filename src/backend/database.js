export const wasteTypes = ["Plastic", "Paper", "Metal", "Glass", "Food Waste", "General Waste"];

export const wasteGuide = [
  ["Plastic", "Plastic bottles, clean containers, packaging trays", "Empty and rinse plastic items before disposal. Avoid food-stained plastic."],
  ["Paper", "Office paper, cardboard, newspapers, paper bags", "Keep paper dry. Wet or oily paper should go to general waste."],
  ["General Waste", "Used tissue, dirty wrappers, mixed or contaminated waste", "Use this bin when the item cannot be cleaned or recycled."],
];

export const gameItems = [
  { id: "g1", name: "Plastic Bottle", bin: "Plastic", shape: "bottle" },
  { id: "g2", name: "Plastic Cup", bin: "Plastic", shape: "cup" },
  { id: "g3", name: "Newspaper", bin: "Paper", shape: "paper" },
  { id: "g4", name: "Cardboard Box", bin: "Paper", shape: "box" },
  { id: "g5", name: "Used Tissue", bin: "General Waste", shape: "crumple" },
  { id: "g6", name: "Food Wrapper", bin: "General Waste", shape: "wrapper" },
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
  { code: "GAL", name: "Galacity", location: "Galacity, Kuching", lat: 1.5155, lng: 110.3737, mapX: 57, mapY: 50 },
  { code: "SAR", name: "Saradise", location: "Saradise, Kuching", lat: 1.5187, lng: 110.3669, mapX: 55, mapY: 48 },
  { code: "EMT", name: "Emart Batu Kawa", location: "Emart Batu Kawa, Kuching", lat: 1.5169, lng: 110.3009, mapX: 32, mapY: 52 },
  { code: "WFT", name: "Waterfront", location: "Kuching Waterfront", lat: 1.5608, lng: 110.3446, mapX: 48, mapY: 24 },
  { code: "TAB", name: "Tabuan", location: "Tabuan, Kuching", lat: 1.5147, lng: 110.3804, mapX: 64, mapY: 54 },
  { code: "KSM", name: "Kota Samarahan", location: "Kota Samarahan, Sarawak", lat: 1.4655, lng: 110.4477, mapX: 78, mapY: 72 },
];

const binTypes = [
  { suffix: "PLA", label: "Plastic", offset: -0.00008 },
  { suffix: "PAP", label: "Paper", offset: 0 },
  { suffix: "GEN", label: "General Waste", offset: 0.00008 },
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
  { id: 1, name: "TNG Reload PIN RM5", points: 5, stock: 40, desc: "Touch 'n Go reload PIN worth RM5." },
  { id: 2, name: "TNG Reload PIN RM10", points: 10, stock: 30, desc: "Touch 'n Go reload PIN worth RM10." },
  { id: 3, name: "TNG Reload PIN RM30", points: 30, stock: 15, desc: "Touch 'n Go reload PIN worth RM30." },
  { id: 4, name: "Electricity Bill Discount 20%", points: 20, stock: 20, desc: "Redeem a 20% discount support voucher for electricity bill payment." },
  { id: 5, name: "Water Bill Discount 20%", points: 20, stock: 20, desc: "Redeem a 20% discount support voucher for water bill payment." },
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
      penalties: 0,
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
      penalties: 0,
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

const normalizeBins = (bins) => {
  const defaultIds = new Set(defaultBins.map((bin) => bin.id));
  const customBins = bins.filter((bin) => !defaultIds.has(bin.id));

  return [
    ...defaultBins.map((defaultBin) => {
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
  const defaultIds = new Set(defaultRewards.map((reward) => reward.id));
  const customRewards = rewards.filter((reward) => !defaultIds.has(reward.id));

  return [
    ...defaultRewards.map((defaultReward) => {
      const savedReward = rewards.find((reward) => reward.id === defaultReward.id);
      return {
        ...defaultReward,
        stock: savedReward?.stock ?? defaultReward.stock,
      };
    }),
    ...customRewards,
  ];
};

const normalizeState = (loadedState) => {
  const bins = normalizeBins(loadedState.bins);
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
    rewardDrafts: loadedState.rewardDrafts || {},
    sensorCheck: loadedState.sensorCheck || { captured: false, confidence: 0 },
    aiDetection: loadedState.aiDetection || null,
    autoRecordedDetectionId: loadedState.autoRecordedDetectionId || null,
    locationCheck: loadedState.locationCheck || { verified: false, distance: null },
    users: loadedState.users.map((user) => ({
      avatar: "",
      phone: "",
      notifications: true,
      privacy: user.role === "admin" ? "Admin only" : "Public ranking",
      ...user,
      location: user.location === "Main Campus" ? "Kuching, Sarawak" : (user.location || (user.role === "admin" ? "Admin Office" : "Kuching, Sarawak")),
    })),
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
      };
    }),
    learningRecords: loadedState.learningRecords || [],
    feedback: (loadedState.feedback || []).map((item) => ({
      userId: null,
      email: "Not recorded",
      ...item,
    })),
  };
};

export const state = loadState();

export const saveState = () => {
  if (!canUseStorage()) return;

  window.localStorage.setItem(storageKey, JSON.stringify(state));
};

export const resetState = () => {
  if (canUseStorage()) window.localStorage.removeItem(storageKey);
  Object.assign(state, structuredClone(defaultState));
};
