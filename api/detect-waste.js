const json = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
};

const readRequestBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => resolve(Buffer.concat(chunks)));
  request.on("error", reject);
});

const parseMultipartImage = (body, contentType = "") => {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1]
    || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) return null;

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = body.indexOf(boundaryBuffer);

  while (cursor !== -1) {
    const next = body.indexOf(boundaryBuffer, cursor + boundaryBuffer.length);
    if (next === -1) break;

    const part = body.subarray(cursor + boundaryBuffer.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString("utf8");
      if (/name="image"/i.test(headerText)) {
        const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "image/jpeg";
        const filename = headerText.match(/filename="([^"]*)"/i)?.[1] || "upload.jpg";
        return {
          buffer: part.subarray(headerEnd + 4),
          filename,
          mimeType,
        };
      }
    }

    cursor = next;
  }

  return null;
};

const heuristicDetection = ({ filename, mimeType }) => {
  return {
    label: "AI detector unavailable",
    category: "General Waste",
    confidence: 0,
    rawConfidence: 0,
    topPredictions: [],
    box: { x: 96, y: 72, width: 320, height: 320 },
    model: "Hosted heuristic fallback",
    presenceDetected: true,
    detectorAvailable: false,
    note: "Set OPENAI_API_KEY in Vercel or VITE_AI_API_BASE_URL for image-based AI classification. Filename heuristics are disabled because they can confuse the selected bin zone with the detected item.",
    filename,
    mimeType,
  };
};

const callOpenAI = async (imageDataUrl) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "Classify the main waste item in this image for a recycling bin app.",
    "Use only the image content. Do not infer from the filename, selected bin zone, or surrounding UI.",
    "Books, notebooks, paper sheets, receipts, newspaper, cartons, and cardboard should be Paper unless badly contaminated.",
    "Return strict JSON only with keys:",
    "label (short string), category (Paper|Plastic|Aluminium|General Waste), confidence (0-100 number).",
    "If the item is contaminated, dirty, mixed-material, food waste, tissue, or non-recyclable rubbish, choose General Waste.",
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
              category: { type: "string", enum: ["Paper", "Plastic", "Aluminium", "General Waste"] },
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

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);

  const payload = await response.json();
  const raw = payload?.output_text || payload?.output?.[0]?.content?.[0]?.text || "{}";
  const parsed = JSON.parse(raw);
  const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0)));

  return {
    label: String(parsed.label || "waste item"),
    category: parsed.category,
    confidence,
    rawConfidence: confidence,
    topPredictions: [],
    box: { x: 96, y: 72, width: 320, height: 320 },
    model: payload?.model || process.env.OPENAI_WASTE_MODEL || "OpenAI vision model",
    presenceDetected: true,
    detectorAvailable: true,
  };
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const image = parseMultipartImage(body, request.headers["content-type"] || "");
    if (!image?.buffer?.length) {
      json(response, 400, { error: "Image file is required." });
      return;
    }

    try {
      const base64 = image.buffer.toString("base64");
      const dataUrl = `data:${image.mimeType};base64,${base64}`;
      const aiResult = await callOpenAI(dataUrl);
      if (aiResult) {
        json(response, 200, aiResult);
        return;
      }
    } catch {
      // Keep the scan flow available even if the hosted AI provider fails.
    }

    json(response, 200, heuristicDetection(image));
  } catch (error) {
    json(response, 500, { error: `Detection failed: ${error.message}` });
  }
}
