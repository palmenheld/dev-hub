import type {
  EbayCandidateInput,
  EbayCandidateOverrides,
} from "@/types/ebay";
import type { ProductCandidate } from "@/types/shopwarePublishing";
import {
  getShippingClass,
  parseHeightRange,
  parsePotDiameter,
} from "@/services/shopware/fieldMapping";

const MANAGED_MISSING = new Set([
  "Artikelnummer",
  "deutscher Name",
  "lateinischer Name",
  "Höhe",
  "Shopware-Preis (GROSS1 oder erster Bruttopreis)",
]);

function inputText(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function inputPrice(value: unknown) {
  const normalized =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyEbayCandidateOverrides(
  candidate: ProductCandidate,
  overrides?: EbayCandidateOverrides
) {
  if (!overrides) return candidate;
  const next: ProductCandidate = {
    ...candidate,
    ...(overrides.articleNumber
      ? { articleNumber: overrides.articleNumber }
      : {}),
    ...(overrides.germanName ? { germanName: overrides.germanName } : {}),
    ...(overrides.latinName
      ? { latinName: overrides.latinName, latinNameSource: "manual" as const }
      : {}),
    ...(overrides.heightCm
      ? {
          heightCm: overrides.heightCm,
          heightMinCm: overrides.heightMinCm ?? overrides.heightCm,
          heightMaxCm: overrides.heightMaxCm ?? overrides.heightCm,
          heightLabel: overrides.heightLabel ?? `${overrides.heightCm} cm`,
          heightSource: "manual" as const,
          shippingClass: getShippingClass(overrides.heightCm),
        }
      : {}),
    ...(overrides.potSize
      ? (() => {
          const parsedPot = parsePotDiameter(overrides.potSize);
          return {
            potSize: parsedPot?.label || overrides.potSize,
            potDiameterCm: parsedPot?.diameterCm,
            potVolumeLiters: parsedPot?.volumeLiters,
            potSizeSource: "manual" as const,
          };
        })()
      : {}),
    ...(overrides.price
      ? {
          price: overrides.price,
          priceSource: "Manuelle Ergänzung für eBay",
          priceFallback: true,
        }
      : {}),
  };
  const missing = candidate.missing.filter((item) => !MANAGED_MISSING.has(item));
  if (!next.articleNumber) missing.push("Artikelnummer");
  if (!next.germanName) missing.push("deutscher Name");
  if (!next.latinName) missing.push("lateinischer Name");
  if (!next.heightCm) missing.push("Höhe");
  if (!next.price || next.price <= 0) {
    missing.push("Shopware-Preis (GROSS1 oder erster Bruttopreis)");
  }
  next.missing = [...new Set(missing)];
  next.eligible = next.missing.length === 0;
  return next;
}

export function ebayCreationMissing(candidate: ProductCandidate) {
  const missing: string[] = [];
  if (!candidate.articleNumber) missing.push("Artikelnummer");
  if (!candidate.germanName) missing.push("deutscher Name");
  if (!candidate.latinName) missing.push("lateinischer Name");
  if (!candidate.heightCm) missing.push("Höhe");
  if (!candidate.price || candidate.price <= 0) missing.push("Verkaufspreis");
  return missing;
}

export function prepareEbayCandidate(
  candidate: ProductCandidate,
  input?: EbayCandidateInput
) {
  if (!input) {
    return { candidate, overrides: undefined as EbayCandidateOverrides | undefined };
  }

  const germanName = inputText(input.germanName, 240);
  const articleNumber = inputText(input.articleNumber, 80);
  const latinName = inputText(input.latinName, 240);
  const heightText = inputText(input.height, 80);
  const potSize = inputText(input.potSize, 80);
  const height = parseHeightRange(heightText, true);
  const price = inputPrice(input.price);
  const overrides: EbayCandidateOverrides = {};

  if (articleNumber && articleNumber !== candidate.articleNumber) {
    overrides.articleNumber = articleNumber;
  }
  if (germanName && germanName !== candidate.germanName) {
    overrides.germanName = germanName;
  }
  if (latinName && latinName !== candidate.latinName) {
    overrides.latinName = latinName;
  }
  if (
    height &&
    !same(
      [height.minCm, height.maxCm],
      [candidate.heightMinCm ?? candidate.heightCm, candidate.heightMaxCm ?? candidate.heightCm]
    )
  ) {
    overrides.heightCm = height.maxCm;
    overrides.heightMinCm = height.minCm;
    overrides.heightMaxCm = height.maxCm;
    overrides.heightLabel = height.label;
  }
  if (potSize && potSize !== candidate.potSize) overrides.potSize = potSize;
  if (price && price !== candidate.price) overrides.price = price;

  const prepared = applyEbayCandidateOverrides(candidate, overrides);
  const missing = ebayCreationMissing(prepared);
  if (missing.length) {
    throw new Error(`Bitte ergänze vor der KI-Erstellung: ${missing.join(", ")}.`);
  }
  return {
    candidate: prepared,
    overrides: Object.keys(overrides).length ? overrides : undefined,
  };
}
