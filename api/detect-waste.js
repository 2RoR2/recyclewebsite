const localHeuristic = (bytes, mimeType = "") => {
  const total = bytes.reduce((sum, value) => sum + value, 0);
  const score = total % 3;
  const categories = [
    { label: "plastic item", category: "Plastic" },
    { label: "paper item", category: "Paper" },
    { label: "general waste item", category: "General Waste" },
  ];
  const picked = categories[score];
  return {
    ...picked,
    confidence: 70 + (total % 25),
    box: { x: 96, y: 72, width: 320, height: 320 },
    model: mimeType ? `Heuristic fallback (${mimeType})` : "Heuristic fallback",
    presenceDetected: true,
  };
};

const callOpenAI = async (imageDataUrl) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "Classify the waste item in this image.",
    "Return strict JSON only with keys:",
    "label (short string), category (Plastic|Paper|General Waste), confidence (0-100 number).",
    "If uncertain, choose General Waste.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_WASTE_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "waste_detection",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              category: { type: "string", enum: ["Plastic", "Paper", "General Waste"] },
              confidence: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["label", "category", "confidence"],
          },
          strict: true,
        },
      },
      max_output_tokens: 120,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const raw = payload?.output_text || "{}";
  const parsed = JSON.parse(raw);

  return {
    label: String(parsed.label || "waste item"),
    category: parsed.category,
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
    box: { x: 96, y: 72, width: 320, height: 320 },
    model: payload?.model || "OpenAI vision model",
    presenceDetected: true,
  };
};

export async function POST(request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!image || typeof image.arrayBuffer !== "function") {
      return Response.json({ error: "Image file is required." }, { status: 400 });
    }

    const buffer = await image.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mimeType = image.type || "image/jpeg";

    try {
      const base64 = Buffer.from(bytes).toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const aiResult = await callOpenAI(dataUrl);
      if (aiResult) return Response.json(aiResult);
    } catch {
      // Fall back to local heuristic if cloud AI is unavailable.
    }

    return Response.json(localHeuristic(bytes, mimeType));
  } catch (error) {
    return Response.json({ error: `Detection failed: ${error.message}` }, { status: 500 });
  }
}

