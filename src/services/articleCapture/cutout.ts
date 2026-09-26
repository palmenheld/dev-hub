import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

const MAX_INPUT_SIZE = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MODEL = "gpt-image-2.5-sunburst";
const DEFAULT_TIMEOUT_MS = 300_000;

const CUTOUT_PROMPT = `
Extract the complete real plant together with its actual pot or container from the input photograph and isolate it on a fully transparent background.
Preserve the exact plant identity, geometry, proportions, leaf count and placement, trunk, branches, visible roots, pot, color, condition, imperfections, and camera perspective.
Keep the entire plant and pot in frame with clean natural alpha edges, including fine leaves and fronds. Remove only the background, floor, hands, people, tools, labels, rulers, scenery, and unrelated objects.
Do not invent, replace, repair, beautify, reshape, crop, rotate, or restyle the plant. Do not add a shadow, backdrop, checkerboard, text, logo, watermark, ruler, or size marker.
Return a photorealistic product cutout with genuine transparent pixels and no halos or color fringing.
`.trim();

type ImageEditResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
};

export type ProductPhotoOptions = {
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
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

function usableHeight(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10_000
    ? Math.round(value)
    : null;
}

function heightLabel(options: ProductPhotoOptions) {
  const first = usableHeight(options.heightMinCm);
  const second = usableHeight(options.heightMaxCm);
  if (first && second && first !== second) {
    const [minimum, maximum] = first < second ? [first, second] : [second, first];
    return `Artikelhöhe ca. ${minimum}–${maximum} cm`;
  }
  const single = first || second;
  return single ? `Artikelhöhe ca. ${single} cm` : null;
}

function escapeSvg(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] || character);
}

function scaleOverlay(width: number, height: number, label: string) {
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.025));
  const barX = margin + Math.max(10, Math.round(width * 0.012));
  const top = Math.round(height * 0.2);
  const bottom = height - margin;
  const fontSize = Math.max(18, Math.min(38, Math.round(width * 0.025)));
  const labelWidth = Math.min(Math.round(width * 0.35), Math.max(240, Math.round(label.length * fontSize * 0.56)));
  const labelHeight = fontSize + Math.max(22, Math.round(fontSize * 0.7));
  const labelX = barX + Math.max(22, Math.round(width * 0.02));
  const labelY = Math.max(top, Math.round((top + bottom - labelHeight) / 2));
  const strokeWidth = Math.max(3, Math.round(width * 0.004));
  const arrow = Math.max(9, Math.round(width * 0.009));
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${barX}" y1="${top}" x2="${barX}" y2="${bottom}" stroke="#0f4f24" stroke-width="${strokeWidth}"/>
      <path d="M ${barX} ${top} l -${arrow} ${arrow + 4} h ${arrow * 2} z" fill="#0f4f24"/>
      <path d="M ${barX} ${bottom} l -${arrow} -${arrow + 4} h ${arrow * 2} z" fill="#0f4f24"/>
      <rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${Math.round(labelHeight / 2)}" fill="#ffffff" fill-opacity="0.92" stroke="#0f4f24" stroke-width="${Math.max(2, Math.round(strokeWidth / 2))}"/>
      <text x="${labelX + Math.round(labelWidth / 2)}" y="${labelY + Math.round(labelHeight * 0.67)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#0f4f24">${escapeSvg(label)}</text>
    </svg>
  `);
}

export async function composePalmenheldProductPhoto(cutout: Buffer, options: ProductPhotoOptions = {}) {
  const metadata = await sharp(cutout, { failOn: "error" }).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error("Das freigestellte Bild besitzt keine gültigen Abmessungen.");

  const logoWidth = Math.max(110, Math.min(320, Math.round(width * 0.2)));
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.025));
  const logo = await sharp(await readFile(path.join(process.cwd(), "public", "logo-palmenheld.png")))
    .resize({ width: logoWidth, withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  const label = heightLabel(options);
  const composites: OverlayOptions[] = [];
  if (label) composites.push({ input: scaleOverlay(width, height, label), top: 0, left: 0 });
  composites.push({
    input: logo.data,
    left: Math.max(0, width - logo.info.width - margin),
    top: Math.max(0, height - logo.info.height - margin),
    blend: "over",
  });

  const bytes = await sharp(cutout, { failOn: "error" })
    .flatten({ background: "#ffffff" })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return { bytes, scaleApplied: Boolean(label) };
}

export async function cutoutPlantPhoto(file: File, options: ProductPhotoOptions = {}) {
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
  const composed = await composePalmenheldProductPhoto(output, options);
  return { bytes: new Uint8Array(composed.bytes), model, scaleApplied: composed.scaleApplied };
}
