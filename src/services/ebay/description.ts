import type { EbayGeneratedCopy, EbayListingDraft } from "@/types/ebay";
import type { ProductCandidate } from "@/types/shopwarePublishing";
import { customerSafePlantText } from "@/services/shopware/customerText";

export const PALMENHELD_LOGO_URL =
  "https://palmenheld.de/media/16/36/09/1740164542/logo_mit_schriftzug.png";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function heading(value: string) {
  return `<h2 style="margin:32px 0 14px;padding:0 0 8px;border-bottom:3px solid #e4a300;color:#0f4f24;font-size:22px;line-height:1.3;">${value}</h2>`;
}

export function renderEbayDescription(
  copy: EbayGeneratedCopy,
  candidate: ProductCandidate,
  research: EbayListingDraft["research"]
) {
  const safeText = (value: string) => customerSafePlantText(value);

  const facts = [
    ["Deutscher Name", research.confirmedGermanName],
    ["Botanischer Name", research.confirmedLatinName],
    candidate.heightLabel ? ["Verkaufsgröße", candidate.heightLabel] : null,
    candidate.potSize ? ["Topfgröße", candidate.potSize] : null,
  ]
    .filter((item): item is string[] => Boolean(item))
    .map(
      ([label, value]) =>
        `<li style="margin:0 0 8px;padding:10px 12px;background:#ffffff;border:1px solid #d9e8dc;border-radius:8px;"><strong style="color:#0f4f24;">${escapeHtml(label)}:</strong> ${label === "Botanischer Name" ? `<em>${escapeHtml(value)}</em>` : escapeHtml(value)}</li>`
    )
    .join("");

  const sellingPoints = copy.sellingPoints
    .map(safeText)
    .filter(Boolean)
    .map(
      (point) =>
        `<li style="margin:0 0 9px;padding:0 0 0 22px;position:relative;"><span style="position:absolute;left:0;color:#e4a300;font-weight:bold;">&#10003;</span>${escapeHtml(point)}</li>`
    )
    .join("");

  const section = (title: string, text: string) =>
    `${heading(title)}<p style="margin:0;color:#1f2937;font-size:16px;line-height:1.7;">${escapeHtml(safeText(text))}</p>`;

  return `<div data-palmenheld-design="v1" style="box-sizing:border-box;width:100%;max-width:900px;margin:0 auto;background:#ffffff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;line-height:1.6;border:1px solid #d9e8dc;">
  <div style="box-sizing:border-box;width:100%;padding:24px 5%;text-align:center;background:#eaf4ec;border-bottom:5px solid #e4a300;">
    <img src="${PALMENHELD_LOGO_URL}" alt="Palmenheld" style="display:block;width:70%;max-width:300px;height:auto;margin:0 auto 12px;">
    <p style="margin:0;color:#17652e;font-size:15px;font-weight:bold;letter-spacing:0.3px;">Ihr Spezialist für mediterrane und exotische Pflanzen</p>
  </div>
  <div style="box-sizing:border-box;width:100%;padding:28px 5% 34px;">
    <div style="margin:0 0 26px;padding:18px 20px;background:#fff5d8;border-left:5px solid #e4a300;border-radius:8px;">
      <p style="margin:0;color:#0f4f24;font-size:18px;line-height:1.6;font-weight:bold;">${escapeHtml(safeText(copy.intro))}</p>
    </div>
    ${heading("Das erhalten Sie")}
    <ul style="margin:0;padding:0;list-style:none;background:#eaf4ec;border-radius:10px;">${facts}</ul>
    ${heading("Besonderheiten")}
    <ul style="margin:0;padding:0;list-style:none;color:#1f2937;font-size:16px;line-height:1.6;">${sellingPoints}</ul>
    ${section("Erscheinungsbild und Wuchs", copy.appearance)}
    ${section("Der passende Standort", copy.location)}
    ${section("Pflege", copy.care)}
    ${section("Überwinterung", copy.winter)}
    <div style="margin:32px 0 0;padding:16px 18px;background:#f6f8f6;border:1px solid #e5e7eb;border-radius:8px;">
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Pflanzen sind Naturprodukte. Wuchsform, Blattzahl und Erscheinungsbild können innerhalb der Art und je nach Saison von den Abbildungen abweichen. Größen- und Temperaturangaben sind Richtwerte; Standort, Wind, Feuchtigkeit, Wurzelraum und Kübelhaltung beeinflussen die Pflanze.</p>
    </div>
  </div>
  <div style="box-sizing:border-box;width:100%;padding:18px 5%;text-align:center;background:#0f4f24;border-top:5px solid #e4a300;">
    <p style="margin:0;color:#ffffff;font-size:15px;font-weight:bold;">Palmenheld</p>
    <p style="margin:4px 0 0;color:#eaf4ec;font-size:13px;">Mediterrane und exotische Pflanzen mit Charakter</p>
  </div>
</div>`;
}

export function descriptionWithoutTrustedAssets(value: string) {
  return value.replaceAll(PALMENHELD_LOGO_URL, "");
}
