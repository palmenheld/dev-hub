import { randomUUID } from "node:crypto";
import type { EbayListingTemplate } from "@/types/ebay";
import type { ProductCandidate } from "@/types/shopwarePublishing";
import { withEbayMutationLock } from "./lock";
import {
  deleteEbayTemplateFile,
  getEbayDraft,
  getEbayTemplate,
  listEbayTemplates,
  saveEbayTemplate,
} from "./store";

const TITLE_TOKENS = new Set([
  "ki_titel",
  "name_de",
  "name_latein",
  "hoehe",
  "topf",
  "sku",
]);

function cleanPattern(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Das Titelmuster fehlt.");
  }
  const pattern = value.replace(/\s+/g, " ").trim();
  if (pattern.length < 3 || pattern.length > 240) {
    throw new Error("Das Titelmuster muss zwischen 3 und 240 Zeichen lang sein.");
  }
  const tokens = [...pattern.matchAll(/\{([^{}]+)\}/g)].map(
    (match) => match[1]
  );
  const invalid = tokens.filter((token) => !TITLE_TOKENS.has(token));
  if (invalid.length) {
    throw new Error(`Unbekannter Platzhalter: {${invalid[0]}}`);
  }
  return pattern;
}

function templateName(value: unknown) {
  if (typeof value !== "string") throw new Error("Der Template-Name fehlt.");
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Der Template-Name muss zwischen 2 und 80 Zeichen lang sein.");
  }
  return name;
}

function priceAdjustment(value: unknown) {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < -90 || result > 1000) {
    throw new Error("Die Preisanpassung muss zwischen -90 % und 1000 % liegen.");
  }
  return Math.round(result * 100) / 100;
}

function quantityLimit(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 1_000_000) {
    throw new Error("Das Bestandslimit muss eine positive ganze Zahl sein.");
  }
  return result;
}

function copyAspects(value: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .map(([name, values]) => [
        name.slice(0, 65),
        [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(
          0,
          30
        ),
      ])
      .filter(([name, values]) => Boolean(name) && values.length)
  );
}

export async function createEbayTemplateFromDraft(input: {
  sourceDraftId: unknown;
  name: unknown;
  titlePattern: unknown;
  priceAdjustmentPercent?: unknown;
  quantityLimit?: unknown;
  isDefault?: unknown;
}) {
  if (
    typeof input.sourceDraftId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(input.sourceDraftId)
  ) {
    throw new Error("Der Ausgangsentwurf ist ungültig.");
  }
  return withEbayMutationLock("ebay-templates", async () => {
    const draft = await getEbayDraft(input.sourceDraftId as string);
    if (!draft) throw new Error("Der Ausgangsentwurf wurde nicht gefunden.");
    if (!/^\d+$/.test(draft.categoryId)) {
      throw new Error(
        "Bitte im Entwurf zuerst eine eBay-Kategorie auswählen und speichern."
      );
    }
    const now = new Date().toISOString();
    const makeDefault = input.isDefault === true;
    if (makeDefault) {
      for (const existing of await listEbayTemplates()) {
        if (existing.isDefault) {
          await saveEbayTemplate({
            ...existing,
            isDefault: false,
            updatedAt: now,
          });
        }
      }
    }
    const listingOptions = draft.options
      ? (() => {
          const { imageUrls, ...savedOptions } = draft.options!;
          void imageUrls;
          return savedOptions;
        })()
      : undefined;
    const template: EbayListingTemplate = {
      id: randomUUID(),
      name: templateName(input.name),
      categoryId: draft.categoryId,
      categoryName: draft.categoryName,
      aspects: copyAspects(draft.aspects),
      ...(listingOptions
        ? { listingOptions }
        : {}),
      titlePattern: cleanPattern(input.titlePattern),
      priceAdjustmentPercent: priceAdjustment(
        input.priceAdjustmentPercent
      ),
      quantityLimit: quantityLimit(input.quantityLimit),
      isDefault: makeDefault,
      createdAt: now,
      updatedAt: now,
    };
    await saveEbayTemplate(template);
    return template;
  });
}

export async function removeEbayTemplate(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Das eBay-Template ist ungültig.");
  }
  return withEbayMutationLock("ebay-templates", async () => {
    const existing = await getEbayTemplate(id);
    if (!existing) throw new Error("Das eBay-Template wurde nicht gefunden.");
    await deleteEbayTemplateFile(id);
    return existing;
  });
}

export async function resolveEbayTemplate(id?: string) {
  if (id === "none") return undefined;
  if (id) {
    const selected = await getEbayTemplate(id);
    if (!selected) throw new Error("Das gewählte eBay-Template wurde nicht gefunden.");
    return selected;
  }
  return (await listEbayTemplates()).find((template) => template.isDefault);
}

function compactTitle(value: string) {
  const clean = value
    .replace(/\s*[-–|/]\s*(?=$|[-–|/])/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–|/,\s]+|[-–|/,\s]+$/g, "")
    .trim();
  if (clean.length <= 80) return clean;
  const shortened = clean.slice(0, 80);
  return shortened.includes(" ")
    ? shortened.slice(0, shortened.lastIndexOf(" ")).trim()
    : shortened;
}

export function applyEbayTemplate(
  template: EbayListingTemplate,
  input: {
    candidate: ProductCandidate;
    germanName: string;
    latinName: string;
    generatedTitle: string;
  }
) {
  const values: Record<string, string> = {
    ki_titel: input.generatedTitle,
    name_de: input.germanName,
    name_latein: input.latinName,
    hoehe: input.candidate.heightLabel ?? "",
    topf: input.candidate.potSize ?? "",
    sku: input.candidate.articleNumber,
  };
  const title = compactTitle(
    template.titlePattern.replace(
      /\{([^{}]+)\}/g,
      (_, token: string) => values[token] || ""
    )
  );
  const basePrice = input.candidate.price;
  if (basePrice === undefined) {
    throw new Error("Der Weclapp-Artikel hat keinen verwendbaren Preis.");
  }
  const adjustedPrice =
    basePrice * (1 + template.priceAdjustmentPercent / 100);
  const stock = Math.max(0, Math.floor(input.candidate.stock ?? 0));
  return {
    title: title || compactTitle(input.generatedTitle),
    categoryId: template.categoryId,
    categoryName: template.categoryName,
    aspects: copyAspects(template.aspects),
    listingOptions: template.listingOptions
      ? {
          ...template.listingOptions,
          imageUrls: input.candidate.imageUrls.slice(0, 24),
        }
      : undefined,
    price: Math.max(0.01, Math.round(adjustedPrice * 100) / 100),
    quantity: template.quantityLimit
      ? Math.min(stock, template.quantityLimit)
      : stock,
  };
}
