import type { EbayGeneratedCopy, EbayListingDraft } from "@/types/ebay";
import type { ProductCandidate } from "@/types/shopwarePublishing";
import { customerSafePlantText } from "@/services/shopware/customerText";

export const PALMENHELD_LOGO_URL =
  "https://palmenheld.de/media/16/36/09/1740164542/logo_mit_schriftzug.png";
export const EBAY_DESCRIPTION_MAX_LENGTH = 4_000;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function heading(value: string) {
  return `<h2 style="color:#0f4f24;border-bottom:2px solid #e4a300">${value}</h2>`;
}

function shortenText(value: string, maximum: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  const candidate = normalized.slice(0, Math.max(1, maximum - 1));
  const sentenceEnd = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("? ")
  );
  if (sentenceEnd >= Math.floor(maximum * 0.58)) {
    return `${candidate.slice(0, sentenceEnd + 1).trim()}`;
  }
  const wordEnd = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, wordEnd > 0 ? wordEnd : candidate.length).trim()}…`;
}

function plainTextFromHtml(value: string) {
  return value
    .replace(/<\s*br\s*\/?>/giu, " ")
    .replace(/<\/(?:p|li|h[1-6]|div)>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;/giu, "'")
    .replace(/&#10003;/giu, "✓")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keeps legacy and manually edited descriptions inside eBay's API limit. */
export function ebayDescriptionForApi(value: string) {
  const normalized = value.replace(/>\s+</gu, "><").trim();
  if (normalized.length <= EBAY_DESCRIPTION_MAX_LENGTH) return normalized;

  const compact = normalized
    .replace(/\s+style=(?:"[^"]*"|'[^']*')/giu, "")
    .replace(/\s+data-palmenheld-design=(?:"[^"]*"|'[^']*')/giu, "")
    .replace(/<h2>/giu, '<h2 style="color:#0f4f24;border-bottom:2px solid #e4a300">')
    .replace(
      /<img\s+([^>]*?)\s*\/?>/iu,
      '<img $1 style="max-width:280px;width:70%;height:auto">'
    );
  if (compact.length <= EBAY_DESCRIPTION_MAX_LENGTH) return compact;

  const opening = '<div style="font-family:Arial;color:#1f2937"><p>';
  const closing =
    '</p><p style="color:#0f4f24"><strong>Palmenheld – mediterrane und exotische Pflanzen</strong></p></div>';
  const budget = EBAY_DESCRIPTION_MAX_LENGTH - opening.length - closing.length;
  let shortened = shortenText(plainTextFromHtml(compact), budget);
  let escaped = escapeHtml(shortened);
  while (escaped.length > budget && shortened.length > 1) {
    shortened = shortenText(
      shortened,
      Math.max(1, shortened.length - (escaped.length - budget) - 1)
    );
    escaped = escapeHtml(shortened);
  }
  return `${opening}${escaped}${closing}`;
}

export function renderEbayDescription(
  copy: EbayGeneratedCopy,
  candidate: ProductCandidate,
  research: EbayListingDraft["research"]
) {
  const safeText = (value: string, maximum: number) =>
    shortenText(customerSafePlantText(value), maximum);

  const facts = [
    ["Deutscher Name", research.confirmedGermanName],
    ["Botanischer Name", research.confirmedLatinName],
    candidate.heightLabel ? ["Verkaufsgröße", candidate.heightLabel] : null,
    candidate.potSize ? ["Topfgröße", candidate.potSize] : null,
  ]
    .filter((item): item is string[] => Boolean(item))
    .map(
      ([label, value]) =>
        `<li><strong style="color:#0f4f24">${escapeHtml(label)}:</strong> ${label === "Botanischer Name" ? `<em>${escapeHtml(value)}</em>` : escapeHtml(value)}</li>`
    )
    .join("");

  const sellingPoints = copy.sellingPoints
    .map((point) => safeText(point, 120))
    .filter(Boolean)
    .slice(0, 4)
    .map(
      (point) =>
        `<li><span style="color:#e4a300">&#10003;</span> ${escapeHtml(point)}</li>`
    )
    .join("");

  const section = (title: string, text: string, maximum: number) =>
    `${heading(title)}<p>${escapeHtml(safeText(text, maximum))}</p>`;

  return ebayDescriptionForApi(
    `<div data-palmenheld-design="v1" style="font-family:Arial;color:#1f2937;line-height:1.55;max-width:900px"><div style="text-align:center;background:#eaf4ec;border-bottom:4px solid #e4a300;padding:16px"><img src="${PALMENHELD_LOGO_URL}" alt="Palmenheld" style="width:70%;max-width:280px;height:auto"><p style="color:#17652e"><strong>Ihr Spezialist für mediterrane und exotische Pflanzen</strong></p></div><div style="padding:12px"><p style="color:#0f4f24;background:#fff5d8;border-left:4px solid #e4a300;padding:12px"><strong>${escapeHtml(safeText(copy.intro, 260))}</strong></p>${heading("Das erhalten Sie")}<ul>${facts}</ul>${heading("Besonderheiten")}<ul>${sellingPoints}</ul>${section("Erscheinungsbild und Wuchs", copy.appearance, 320)}${section("Der passende Standort", copy.location, 280)}${section("Pflege", copy.care, 350)}${section("Überwinterung", copy.winter, 320)}<p style="color:#6b7280;font-size:13px">Pflanzen sind Naturprodukte. Wuchsform und Erscheinungsbild können je nach Art und Saison von den Abbildungen abweichen. Größen- und Temperaturangaben sind Richtwerte und hängen auch vom Standort ab.</p></div><p style="text-align:center;background:#0f4f24;color:#fff;padding:14px"><strong>Palmenheld</strong><br> Mediterrane und exotische Pflanzen mit Charakter</p></div>`
  );
}

export function descriptionWithoutTrustedAssets(value: string) {
  return value.replaceAll(PALMENHELD_LOGO_URL, "");
}
