const MAX_INPUT_SIZE = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const DEFAULT_TIMEOUT_MS = 300_000;

const CUTOUT_PROMPT = `
Extract the complete real plant together with its actual pot or container from the input photograph and isolate it on a fully transparent background.
Preserve the exact plant identity, geometry, proportions, leaf count and placement, trunk, branches, visible roots, pot, color, condition, imperfections, and camera perspective.
Keep the entire plant and pot in frame with clean natural alpha edges, including fine leaves and fronds. Remove only the background, floor, hands, people, tools, labels, rulers, scenery, and unrelated objects.
Do not invent, replace, repair, beautify, reshape, crop, rotate, or restyle the plant. Do not add a shadow, backdrop, checkerboard, text, logo, or watermark.
Return a photorealistic product cutout with genuine transparent pixels and no halos or color fringing.
`.trim();

type ImageEditResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
};

function requestTimeout() {
  const configured = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 10_000
    ? Math.min(configured, 600_000)
    : DEFAULT_TIMEOUT_MS;
}

function imageQuality() {
  const configured = process.env.OPENAI_IMAGE_EDIT_QUALITY?.trim();
  return configured && ["low", "medium", "high", "xhigh", "max", "auto"].includes(configured)
    ? configured
    : "medium";
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "");
  return cleaned.slice(0, 120) || "pflanze.jpg";
}

export async function cutoutPlantPhoto(file: File) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Für die KI-Freistellung fehlt OPENAI_API_KEY in der Server-Konfiguration.");
  if (!file.size || file.size > MAX_INPUT_SIZE) {
    throw new Error("Das Foto muss zwischen 1 Byte und 12 MB groß sein.");
  }
  const contentType = file.type.toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error("Für die KI-Freistellung sind JPG, PNG und WebP erlaubt.");
  }

  const model = process.env.OPENAI_IMAGE_EDIT_MODEL?.trim() || DEFAULT_MODEL;
  const body = new FormData();
  body.append("model", model);
  body.append("image[]", file, safeFileName(file.name));
  body.append("prompt", CUTOUT_PROMPT);
  body.append("size", "auto");
  body.append("quality", imageQuality());
  body.append("background", "transparent");
  body.append("output_format", "png");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout());
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Die KI-Freistellung hat zu lange gedauert. Bitte erneut versuchen.");
    }
    throw new Error("Die KI-Freistellung konnte OpenAI nicht erreichen.");
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => ({}))) as ImageEditResponse;
  if (!response.ok) {
    const detail = payload.error?.message?.trim();
    throw new Error(detail ? `OpenAI konnte das Foto nicht freistellen: ${detail}` : "OpenAI konnte das Foto nicht freistellen.");
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) throw new Error("OpenAI hat kein freigestelltes Bild zurückgegeben.");
  const output = Buffer.from(encoded, "base64");
  if (
    output.length < 8 ||
    output[0] !== 0x89 ||
    output[1] !== 0x50 ||
    output[2] !== 0x4e ||
    output[3] !== 0x47
  ) {
    throw new Error("OpenAI hat kein gültiges transparentes PNG zurückgegeben.");
  }
  return { bytes: new Uint8Array(output), model };
}
