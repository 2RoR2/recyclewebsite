export const wasteTypes = ["Plastic", "Paper", "Metal", "Glass", "Food Waste", "General Waste"];

export const wasteGuide = [
  ["Plastic", "Bottles, clean food containers, packaging trays", "Empty and rinse before disposal. Avoid food-stained plastic."],
  ["Paper", "Office paper, cardboard, newspapers, paper bags", "Keep paper dry. Wet or oily paper should not go into paper recycling."],
  ["Metal", "Drink cans, food tins, aluminium containers", "Rinse cans and press them flat when possible to save bin space."],
  ["Glass", "Glass bottles and jars", "Remove caps and avoid broken glass unless the bin accepts it safely."],
  ["Food Waste", "Leftovers, fruit peels, tea bags, coffee grounds", "Use food-waste bins only. Do not mix plastic wrappers with food waste."],
  ["General Waste", "Non-recyclable mixed waste and contaminated items", "Use this only when the item cannot be cleaned or recycled."],
];

export const quizQuestions = [
  {
    id: "q1",
    question: "Which bin should a clean plastic bottle go into?",
    options: ["Plastic", "Food Waste", "General Waste"],
    answer: "Plastic",
  },
  {
    id: "q2",
    question: "What should you do before recycling a drink can?",
    options: ["Rinse it", "Fill it with food", "Wrap it in tissue"],
    answer: "Rinse it",
  },
  {
    id: "q3",
    question: "Where should oily food paper usually go?",
    options: ["Paper", "General Waste", "Glass"],
    answer: "General Waste",
  },
  {
    id: "q4",
    question: "Which bin should dry newspaper go into?",
    options: ["Paper", "Plastic", "Food Waste"],
    answer: "Paper",
  },
  {
    id: "q5",
    question: "Which item belongs in a general waste bin?",
    options: ["Used tissue", "Clean cardboard", "Plastic bottle"],
    answer: "Used tissue",
  },
  {
    id: "q6",
    question: "What should you do with a plastic bottle before recycling?",
    options: ["Empty and rinse it", "Leave drink inside", "Put food inside it"],
    answer: "Empty and rinse it",
  },
  {
    id: "q7",
    question: "Which bin should clean cardboard go into?",
    options: ["Paper", "Glass", "Food Waste"],
    answer: "Paper",
  },
  {
    id: "q8",
    question: "Which waste type is a banana peel?",
    options: ["Food Waste", "Metal", "Paper"],
    answer: "Food Waste",
  },
  {
    id: "q9",
    question: "Which bin should a soda can go into if a metal bin is available?",
    options: ["Metal", "Glass", "General Waste"],
    answer: "Metal",
  },
  {
    id: "q10",
    question: "Which item should not go into paper recycling?",
    options: ["Oily pizza box", "Dry newspaper", "Clean paper bag"],
    answer: "Oily pizza box",
  },
  {
    id: "q11",
    question: "Which bin should a glass jar go into if a glass bin is available?",
    options: ["Glass", "Plastic", "Paper"],
    answer: "Glass",
  },
  {
    id: "q12",
    question: "What causes recycling contamination?",
    options: ["Putting wrong waste in the bin", "Rinsing bottles", "Flattening cardboard"],
    answer: "Putting wrong waste in the bin",
  },
  {
    id: "q13",
    question: "Which item is usually recyclable as plastic?",
    options: ["Clean detergent bottle", "Banana peel", "Wet tissue"],
    answer: "Clean detergent bottle",
  },
  {
    id: "q14",
    question: "What should wet paper usually be treated as?",
    options: ["General Waste", "Clean Paper", "Glass"],
    answer: "General Waste",
  },
  {
    id: "q15",
    question: "Which action saves bin space?",
    options: ["Flatten cans or boxes", "Leave bottles full", "Mix all waste together"],
    answer: "Flatten cans or boxes",
  },
  {
    id: "q16",
    question: "Which waste type is leftover rice?",
    options: ["Food Waste", "Paper", "Plastic"],
    answer: "Food Waste",
  },
  {
    id: "q17",
    question: "Which item should go into general waste?",
    options: ["Contaminated wrapper", "Clean glass jar", "Dry cardboard"],
    answer: "Contaminated wrapper",
  },
  {
    id: "q18",
    question: "Why should recyclable containers be rinsed?",
    options: ["To reduce smell and contamination", "To make them heavier", "To waste water"],
    answer: "To reduce smell and contamination",
  },
  {
    id: "q19",
    question: "Which bin should a clean plastic cup go into?",
    options: ["Plastic", "Paper", "Food Waste"],
    answer: "Plastic",
  },
  {
    id: "q20",
    question: "What should you do if you are unsure whether an item is recyclable?",
    options: ["Check the guide or bin label", "Throw it into any bin", "Hide it under paper"],
    answer: "Check the guide or bin label",
  },
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
  name: "Smart Recycle Collection Counter",
  place: "i-CATS University College, Kuching",
  address: "Jalan Stampin Timur, 93350 Kuching, Sarawak",
  lat: 1.51983,
  lng: 110.351,
};

const defaultState = {
  page: "home",
  authMode: "login",
  currentUserId: null,
  pendingBinId: null,
  selectedBinId: "BIN-001",
  selectedWaste: "Plastic",
  selectedRewardId: null,
  form: { name: "", email: "", password: "", issue: "" },
  newItem: { name: "", points: 5, stock: 10 },
  newQuiz: { question: "", option1: "", option2: "", option3: "", answer: "" },
  quizQuestions,
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
      location: "Main Campus",
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
  bins: [
    { id: "BIN-001", name: "Plastic Bin", location: "i-CATS main entrance", status: "Available", accepts: "Plastic", mapX: 45, mapY: 44, lat: 1.51983, lng: 110.351 },
    { id: "BIN-002", name: "Paper Bin", location: "i-CATS cafeteria area", status: "Available", accepts: "Paper", mapX: 58, mapY: 50, lat: 1.52022, lng: 110.35145 },
    { id: "BIN-003", name: "General Waste Bin", location: "Near i-CATS lecture block", status: "Available", accepts: "General Waste", mapX: 36, mapY: 60, lat: 1.51935, lng: 110.35062 },
  ],
  rewards: [
    { id: 1, name: "Reusable Bottle", points: 8, stock: 12, desc: "Eco bottle for daily use." },
    { id: 2, name: "Canvas Tote Bag", points: 6, stock: 20, desc: "Reusable shopping and school bag." },
    { id: 3, name: "Notebook", points: 4, stock: 30, desc: "Recycled-paper notebook." },
  ],
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

const normalizeBins = (bins) =>
  bins.map((bin, index) => {
    const standardBins = [
      { name: "Plastic Bin", location: "i-CATS main entrance", accepts: "Plastic" },
      { name: "Paper Bin", location: "i-CATS cafeteria area", accepts: "Paper" },
      { name: "General Waste Bin", location: "Near i-CATS lecture block", accepts: "General Waste" },
    ];

    return {
      mapX: [28, 62, 45, 76, 18][index % 5],
      mapY: [34, 46, 72, 24, 66][index % 5],
      lat: [1.51983, 1.52022, 1.51935, 1.52058, 1.51902][index % 5],
      lng: [110.351, 110.35145, 110.35062, 110.3502, 110.3518][index % 5],
      accepts: ["Plastic", "Paper", "General Waste", "Metal", "Glass"][index % 5],
      ...bin,
      ...(standardBins[index] || {}),
    };
  });

const normalizeState = (loadedState) => {
  const bins = normalizeBins(loadedState.bins);

  return {
    ...loadedState,
    pendingBinId: loadedState.pendingBinId || null,
    users: loadedState.users.map((user) => ({
      avatar: "",
      phone: "",
      location: user.role === "admin" ? "Admin Office" : "Main Campus",
      notifications: true,
      privacy: user.role === "admin" ? "Admin only" : "Public ranking",
      ...user,
    })),
    bins,
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
    newQuiz: {
      question: "",
      option1: "",
      option2: "",
      option3: "",
      answer: "",
      ...(loadedState.newQuiz || {}),
    },
    quizQuestions: mergeQuizQuestions(loadedState.quizQuestions || []),
    learningRecords: loadedState.learningRecords || [],
    feedback: (loadedState.feedback || []).map((item) => ({
      userId: null,
      email: "Not recorded",
      ...item,
    })),
  };
};

const mergeQuizQuestions = (savedQuestions) => {
  const savedIds = new Set(savedQuestions.map((question) => question.id));
  return [
    ...savedQuestions,
    ...quizQuestions.filter((question) => !savedIds.has(question.id)),
  ];
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
