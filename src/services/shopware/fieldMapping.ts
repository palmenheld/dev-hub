import { WeclappArticle } from "@/services/weclapp/types/article";
import {
  ProductCandidate,
  ShippingClass,
  WeclappFieldKey,
  WeclappFieldMap,
  WeclappFieldOption,
} from "@/types/shopwarePublishing";

const CUSTOM_ATTRIBUTE_KEYS = [
  "customAttributeDefinitionId",
  "attributeDefinitionId",
  "definitionId",
  "name",
  "key",
];

const VALUE_KEYS = [
  "stringValue",
  "numberValue",
  "booleanValue",
  "selectedValue",
  "selectedValues",
  "value",
];

const FIELD_HINTS: Record<WeclappFieldKey, RegExp> = {
  germanName: /(^|\W)(name|bezeichnung|deutsch)/i,
  latinName: /(latein|latin|botan|scientific)/i,
  heightCm: /(höhe|hoehe|height|wuchshöhe|wuchshoehe)/i,
  potSize: /(topf|pot|container)/i,
  images: /(bild|foto|image|photo|media)/i,
  stock: /(bestand|lager|stock|quantity|available)/i,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).slice(0, 100);
  }
  try {
    return JSON.stringify(value).slice(0, 100);
  } catch {
    return "";
  }
}

function flatten(
  value: unknown,
  fieldPath: string,
  output: Map<string, string>,
  depth = 0
) {
  if (depth > 5 || value === null || value === undefined) return;
  if (typeof value !== "object") {
    if (fieldPath && !output.has(fieldPath)) {
      output.set(fieldPath, displayValue(value));
    }
    return;
  }
  if (Array.isArray(value)) {
    if (fieldPath && !output.has(fieldPath)) {
      output.set(fieldPath, displayValue(value));
    }
    for (const item of value.slice(0, 3)) {
      flatten(item, fieldPath, output, depth + 1);
    }
    return;
  }
  for (const [key, child] of Object.entries(
    value as Record<string, unknown>
  )) {
    flatten(child, fieldPath ? `${fieldPath}.${key}` : key, output, depth + 1);
  }
}

function customAttributeSelector(item: Record<string, unknown>) {
  for (const key of CUSTOM_ATTRIBUTE_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return `custom:${value.trim()}`;
    }
  }
  return "";
}

function customAttributeValue(item: Record<string, unknown>) {
  for (const key of VALUE_KEYS) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
      return item[key];
    }
  }
  return undefined;
}

export function listFieldOptions(
  articles: WeclappArticle[]
): WeclappFieldOption[] {
  const found = new Map<string, string>();
  for (const article of articles) {
    flatten(article, "", found);
    const customAttributes = article.customAttributes;
    if (!Array.isArray(customAttributes)) continue;
    for (const raw of customAttributes) {
      if (!isRecord(raw)) continue;
      const selector = customAttributeSelector(raw);
      if (selector && !found.has(selector)) {
        found.set(selector, displayValue(customAttributeValue(raw)));
      }
    }
  }
  return [...found.entries()]
    .map(([selector, sample]) => ({
      selector,
      label: selector.startsWith("custom:")
        ? `Zusatzfeld ${selector.slice("custom:".length)}`
        : selector,
      sample,
      detectedFor: (Object.keys(FIELD_HINTS) as WeclappFieldKey[]).filter(
        (key) => FIELD_HINTS[key].test(selector)
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function inferFieldMap(
  stored: WeclappFieldMap,
  options: WeclappFieldOption[]
): WeclappFieldMap {
  const result = { ...stored };
  for (const key of Object.keys(result) as WeclappFieldKey[]) {
    if (
      result[key] &&
      options.some((option) => option.selector === result[key])
    ) {
      continue;
    }
    result[key] =
      options.find((option) => option.detectedFor.includes(key))?.selector ??
      result[key];
  }
  return result;
}

export function readSelector(
  article: WeclappArticle,
  selector: string
): unknown {
  if (!selector) return undefined;
  if (selector.startsWith("custom:")) {
    const wanted = selector.slice("custom:".length);
    const customAttributes = article.customAttributes;
    if (!Array.isArray(customAttributes)) return undefined;
    for (const raw of customAttributes) {
      if (!isRecord(raw)) continue;
      if (customAttributeSelector(raw) === `custom:${wanted}`) {
        return customAttributeValue(raw);
      }
    }
    return undefined;
  }
  let current: unknown = article;
  for (const part of selector.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return "";
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join(", ");
  }
  return "";
}

export type ParsedHeight = {
  minCm: number;
  maxCm: number;
  label: string;
};

function toCentimeters(value: string, unit?: string) {
  const number = Number(value);
  return unit?.toLowerCase() === "m" ? number * 100 : number;
}

function validHeight(minCm: number, maxCm: number): ParsedHeight | undefined {
  const lower = Math.min(minCm, maxCm);
  const upper = Math.max(minCm, maxCm);
  if (
    !Number.isFinite(lower) ||
    !Number.isFinite(upper) ||
    lower <= 0 ||
    upper > 2000
  ) {
    return undefined;
  }
  const format = (number: number) =>
    Number.isInteger(number) ? String(number) : number.toFixed(1).replace(".", ",");
  return {
    minCm: lower,
    maxCm: upper,
    label:
      lower === upper
        ? format(upper) + " cm"
        : format(lower) + "–" + format(upper) + " cm",
  };
}

function hasPotContext(text: string, matchIndex: number) {
  const context = text.slice(Math.max(0, matchIndex - 18), matchIndex);
  return /(topf|pot|container|durchmesser|\bø\s*)/i.test(context);
}

export function parseHeightRange(
  value: unknown,
  allowUnitless = true
): ParsedHeight | undefined {
  const text = textValue(value)
    .replace(/,/g, ".")
    .replace(/[–—]/g, "-");
  if (!text) return undefined;

  const ranges: ParsedHeight[] = [];
  const rangePattern =
    /(\d+(?:\.\d+)?)\s*(cm|m)?\s*(?:-|\/|\bbis\b)\s*(\d+(?:\.\d+)?)\s*(cm|m)\b/gi;
  for (const match of text.matchAll(rangePattern)) {
    if (hasPotContext(text, match.index ?? 0)) continue;
    const finalUnit = match[4];
    const parsed = validHeight(
      toCentimeters(match[1], match[2] || finalUnit),
      toCentimeters(match[3], finalUnit)
    );
    if (parsed) ranges.push(parsed);
  }
  if (ranges.length) {
    return ranges.sort((left, right) => right.maxCm - left.maxCm)[0];
  }

  const labelled = text.match(
    /(?:gesamthöhe|gesamthoehe|höhe|hoehe|height|\bh)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(cm|m)?(?:\s*(?:-|\/|\bbis\b)\s*(\d+(?:\.\d+)?)\s*(cm|m)?)?/i
  );
  if (labelled) {
    const finalUnit = labelled[4] || labelled[2] || "cm";
    const parsed = validHeight(
      toCentimeters(labelled[1], labelled[2] || finalUnit),
      toCentimeters(labelled[3] || labelled[1], finalUnit)
    );
    if (parsed) return parsed;
  }

  const singles: ParsedHeight[] = [];
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(cm|m)\b/gi)) {
    if (hasPotContext(text, match.index ?? 0)) continue;
    const centimeters = toCentimeters(match[1], match[2]);
    const parsed = validHeight(centimeters, centimeters);
    if (parsed) singles.push(parsed);
  }
  if (singles.length) {
    return singles.sort((left, right) => right.maxCm - left.maxCm)[0];
  }

  if (allowUnitless) {
    const bareRange = text.match(
      /(\d+(?:\.\d+)?)\s*(?:-|\/|\bbis\b)\s*(\d+(?:\.\d+)?)/i
    );
    if (bareRange && bareRange[0].trim() === text.trim()) {
      return validHeight(Number(bareRange[1]), Number(bareRange[2]));
    }
    const bareNumber = Number(text.trim());
    if (Number.isFinite(bareNumber)) {
      return validHeight(bareNumber, bareNumber);
    }
  }
  return undefined;
}

export function parseHeightCm(value: unknown): number | undefined {
  return parseHeightRange(value)?.maxCm;
}

export type ParsedPotDiameter = {
  diameterCm: number;
  code: string;
  label: string;
};

export function parsePotDiameter(value: unknown): ParsedPotDiameter | undefined {
  const text = textValue(value);
  const match = text.match(/\b([cvm])\s*[-:]?\s*(\d{1,3})(?!\d)/i);
  if (!match) return undefined;
  const diameterCm = Number(match[2]);
  if (!Number.isFinite(diameterCm) || diameterCm < 5 || diameterCm > 200) {
    return undefined;
  }
  const code = match[1].toUpperCase() + String(diameterCm);
  return {
    diameterCm,
    code,
    label: "Ø " + diameterCm + " cm (" + code + ")",
  };
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const number = Number(textValue(value).replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function collectUrls(value: unknown, output: Set<string>, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      try {
        const url = new URL(match[0]);
        if (["http:", "https:"].includes(url.protocol)) {
          output.add(url.toString());
        }
      } catch {}
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, output, depth + 1);
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (
        /url|download|image|photo|media|thumbnail/i.test(key) ||
        typeof child === "object"
      ) {
        collectUrls(child, output, depth + 1);
      }
    }
  }
}

function collectNativeArticleImages(
  article: WeclappArticle,
  output: Set<string>
) {
  if (!Array.isArray(article.articleImages)) return;
  const images = article.articleImages
    .filter(isRecord)
    .sort(
      (left, right) =>
        Number(Boolean(right.mainImage)) - Number(Boolean(left.mainImage))
    );
  for (const image of images) {
    const imageId = textValue(image.id);
    if (!/^\d+$/.test(imageId)) continue;
    output.add(
      `/api/weclapp/articles/${encodeURIComponent(article.id)}/images/${encodeURIComponent(imageId)}`
    );
  }
}

export function getShippingClass(heightCm: number): ShippingClass {
  if (heightCm <= 120) {
    return {
      key: "parcel",
      label: "Paket bis 120 cm",
      description: "Standard-Paketversand",
    };
  }
  if (heightCm <= 170) {
    return {
      key: "bulky",
      label: "Sperrgut bis 170 cm",
      description: "Großes Paket oder Sperrgut",
    };
  }
  if (heightCm <= 230) {
    return {
      key: "pallet",
      label: "Palette bis 230 cm",
      description: "Speditionsversand auf Palette",
    };
  }
  return {
    key: "oversize",
    label: "Übergröße über 230 cm",
    description: "Individuelle Spedition",
  };
}

export function mapCandidate(
  article: WeclappArticle,
  price: number | undefined,
  fieldMap: WeclappFieldMap,
  alreadyInShopware = false,
  priceSource?: string,
  priceFallback = false
): ProductCandidate {
  const germanName =
    textValue(readSelector(article, fieldMap.germanName)) ||
    textValue(article.name);
  const latinName = textValue(readSelector(article, fieldMap.latinName));
  const mappedHeight = parseHeightRange(
    readSelector(article, fieldMap.heightCm),
    true
  );
  const nameHeight = parseHeightRange(article.name, false);
  const height = mappedHeight ?? nameHeight;
  const heightCm = height?.maxCm;
  const explicitPotSize = textValue(
    readSelector(article, fieldMap.potSize)
  );
  const mappedPot = parsePotDiameter(explicitPotSize);
  const namePot = parsePotDiameter(article.name);
  const parsedPot = mappedPot ?? namePot;
  const potSize = parsedPot?.label || explicitPotSize || undefined;
  const stock = numericValue(readSelector(article, fieldMap.stock));
  const imageSet = new Set<string>();
  collectNativeArticleImages(article, imageSet);
  collectUrls(readSelector(article, fieldMap.images), imageSet);
  const imageUrls = [...imageSet].slice(0, 12);
  const articleNumber = textValue(article.articleNumber);
  const missing: string[] = [];

  if (!articleNumber) missing.push("Artikelnummer");
  if (!germanName) missing.push("deutscher Name");
  if (!latinName) missing.push("lateinischer Name");
  if (!heightCm) missing.push("Höhe");
  if (!price || price <= 0) missing.push("Shopware-Preis (GROSS1 oder erster Bruttopreis)");
  if (!imageUrls.length) missing.push("Fotos mit erreichbarer URL");
  if (alreadyInShopware) missing.push("bereits in Shopware vorhanden");

  return {
    articleId: article.id,
    articleNumber,
    germanName,
    latinName,
    active: article.active !== false,
    heightCm,
    heightMinCm: height?.minCm,
    heightMaxCm: height?.maxCm,
    heightLabel: height?.label,
    heightSource: mappedHeight ? "field" : nameHeight ? "product_name" : undefined,
    potSize,
    potDiameterCm: parsedPot?.diameterCm,
    potSizeSource: explicitPotSize
      ? "field"
      : namePot
        ? "product_name"
        : undefined,
    price,
    priceSource,
    priceFallback,
    stock,
    imageUrls,
    eligible: missing.length === 0,
    missing,
    shippingClass: heightCm ? getShippingClass(heightCm) : undefined,
    alreadyInShopware,
  };
}
