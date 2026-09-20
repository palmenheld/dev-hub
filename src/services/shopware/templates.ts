import { randomUUID } from "node:crypto";
import type {
  ProductCandidate,
  ShopwareProductTemplate,
} from "@/types/shopwarePublishing";
import {
  getDraft,
  listProductTemplates,
  saveProductTemplates,
} from "./dataStore";
import { withMutationLock } from "./mutationLock";

function text(value: unknown, maximum: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : "";
}

function number(value: unknown, minimum: number, maximum: number) {
  const result = Number(value);
  return Number.isFinite(result) && result >= minimum && result <= maximum
    ? result
    : undefined;
}

export async function resolveProductTemplate(id?: string) {
  const templates = await listProductTemplates();
  return id
    ? templates.find((template) => template.id === id)
    : templates.find((template) => template.isDefault);
}

export function applyProductTemplate(
  template: ShopwareProductTemplate,
  draft: {
    generatedTitle: string;
    candidate: ProductCandidate;
    germanName: string;
    latinName: string;
    price: number;
    stock: number;
  }
) {
  const replacements: Record<string, string> = {
    "{ki_titel}": draft.generatedTitle,
    "{deutscher_name}": draft.germanName,
    "{lateinischer_name}": draft.latinName,
    "{höhe}": draft.candidate.heightLabel ?? "",
    "{topfgröße}": draft.candidate.potSize ?? "",
    "{artikelnummer}": draft.candidate.articleNumber,
  };
  let title = template.titlePattern;
  for (const [token, value] of Object.entries(replacements)) {
    title = title.split(token).join(value);
  }
  title = title.replace(/\s+/g, " ").replace(/\s+([,–-])/g, "$1").trim();
  const adjustedPrice =
    Math.round(
      (draft.price * (1 + template.priceAdjustmentPercent / 100) +
        Number.EPSILON) *
        100
    ) / 100;
  return {
    title: title || draft.generatedTitle,
    price: Math.max(0.01, adjustedPrice),
    stock:
      template.stockLimit === undefined
        ? draft.stock
        : Math.min(draft.stock, template.stockLimit),
    active: template.active,
    keywords: template.keywords,
  };
}

export async function saveProductTemplateFromDraft(
  draftId: string,
  input: Record<string, unknown>
) {
  return withMutationLock("product-templates", async () => {
    const draft = await getDraft(draftId);
    if (!draft) throw new Error("Der Shopware-Entwurf wurde nicht gefunden.");
    const name = text(input.name, 100);
    if (name.length < 2) throw new Error("Bitte einen Template-Namen eingeben.");
    const titlePattern = text(input.titlePattern, 180) || "{ki_titel}";
    const adjustment = number(input.priceAdjustmentPercent, -90, 500) ?? 0;
    const stockLimit =
      input.stockLimit === "" || input.stockLimit === undefined
        ? undefined
        : number(input.stockLimit, 0, 1_000_000);
    if (input.stockLimit !== "" && input.stockLimit !== undefined && stockLimit === undefined) {
      throw new Error("Die Bestandsgrenze ist ungültig.");
    }
    const templates = await listProductTemplates();
    const now = new Date().toISOString();
    const template: ShopwareProductTemplate = {
      id: randomUUID(),
      name,
      titlePattern,
      priceAdjustmentPercent: adjustment,
      stockLimit,
      active: input.active === true,
      keywords: draft.research.keywords.slice(0, 15),
      isDefault: input.isDefault === true,
      createdAt: now,
      updatedAt: now,
    };
    const next = [
      template,
      ...templates.map((item) =>
        template.isDefault ? { ...item, isDefault: false } : item
      ),
    ];
    await saveProductTemplates(next);
    return template;
  });
}

export async function deleteProductTemplate(id: string) {
  return withMutationLock("product-templates", async () => {
    const templates = await listProductTemplates();
    const next = templates.filter((template) => template.id !== id);
    if (next.length === templates.length) {
      throw new Error("Das Shopware-Template wurde nicht gefunden.");
    }
    await saveProductTemplates(next);
  });
}
