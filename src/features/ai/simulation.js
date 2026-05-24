export const simulatedWasteItems = [
  { label: "Plastic Bottle", category: "Plastic" },
  { label: "Paper", category: "Paper" },
  { label: "Aluminium Can", category: "Aluminium" },
  { label: "Food Waste", category: "General Waste" },
];

export const simulateAiDetection = (random = Math.random) => {
  const index = Math.floor(random() * simulatedWasteItems.length);
  return simulatedWasteItems[Math.min(index, simulatedWasteItems.length - 1)];
};

export const validateSimulatedDisposal = (selectedZone, detectedItem) => {
  const detected = typeof detectedItem === "string"
    ? simulatedWasteItems.find((item) => item.label === detectedItem)
    : detectedItem;
  const correct = Boolean(selectedZone && detected?.category === selectedZone);

  return {
    status: correct ? "correct" : "wrong",
    points: correct ? 1 : 0,
    message: correct ? "Correct disposal! +1 point earned." : "Wrong bin detected. No point added.",
  };
};
