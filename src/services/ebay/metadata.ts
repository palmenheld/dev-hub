import type {
  EbayAspect,
  EbayCategorySuggestion,
  EbayConditionOption,
  EbayConnection,
  EbayOption,
  EbaySetup,
} from "@/types/ebay";
import { ebayRequest, verifyEbayAccessToken } from "./client";
import { getEbayConnection } from "./config";
import { getEbaySettings } from "./store";

type PolicyRecord = {
  name?: string;
  description?: string;
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
};
type LocationRecord = {
  merchantLocationKey?: string;
  name?: string;
  location?: { address?: { city?: string; postalCode?: string } };
  locationStatus?: string;
};
type CategorySuggestionRecord = {
  category?: { categoryId?: string; categoryName?: string };
  categoryTreeNodeAncestors?: Array<{
    categoryId?: string;
    categoryName?: string;
  }>;
};
type AspectRecord = {
  localizedAspectName?: string;
  aspectConstraint?: {
    aspectRequired?: boolean;
    aspectUsage?: string;
    aspectMode?: string;
    aspectMaxLength?: number;
    itemToAspectCardinality?: string;
  };
  aspectValues?: Array<{ localizedValue?: string }>;
};

function setupWarning(label: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unbekannter eBay-Fehler";
  if (message.includes("User is not eligible for Business Policy")) {
    return `${label}: Das eBay-Sandbox-Konto ist noch nicht für Geschäftsrichtlinien freigeschaltet.`;
  }
  if (message.includes('"errorId":25001') || message.includes("System error")) {
    return `${label}: Die eBay-Sandbox meldet momentan einen internen Systemfehler.`;
  }
  return `${label}: ${message}`;
}

function setupResult<T>(
  label: string,
  result: PromiseSettledResult<T | null>,
  warnings: string[]
) {
  if (result.status === "fulfilled") return result.value;
  warnings.push(setupWarning(label, result.reason));
  return null;
}

function policyOptions(
  records: PolicyRecord[] | undefined,
  idKey: "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId"
): EbayOption[] {
  return (records ?? [])
    .map((item) => ({
      id: item[idKey] ?? "",
      label: item.name?.trim() || item[idKey] || "Ohne Namen",
      detail: item.description?.trim(),
    }))
    .filter((item) => item.id);
}

export async function loadEbaySetup(): Promise<EbaySetup> {
  const settings = await getEbaySettings();
  const baseConnection = getEbayConnection(settings);
  if (!baseConnection.configured) {
    return {
      connection: baseConnection,
      settings,
      locations: [],
      fulfillmentPolicies: [],
      paymentPolicies: [],
      returnPolicies: [],
      warnings: [],
    };
  }

  await verifyEbayAccessToken();
  const market = encodeURIComponent(settings.marketplaceId);
  const results = await Promise.allSettled([
    ebayRequest<{ locations?: LocationRecord[] }>(
      "sell/inventory/v1/location?limit=200"
    ),
    ebayRequest<{ fulfillmentPolicies?: PolicyRecord[] }>(
      `sell/account/v1/fulfillment_policy?marketplace_id=${market}`
    ),
    ebayRequest<{ paymentPolicies?: PolicyRecord[] }>(
      `sell/account/v1/payment_policy?marketplace_id=${market}`
    ),
    ebayRequest<{ returnPolicies?: PolicyRecord[] }>(
      `sell/account/v1/return_policy?marketplace_id=${market}`
    ),
  ]);
  const warnings: string[] = [];
  const locationResult = setupResult("Lagerorte", results[0], warnings);
  const fulfillmentResult = setupResult(
    "Versandrichtlinien",
    results[1],
    warnings
  );
  const paymentResult = setupResult("Zahlungsrichtlinien", results[2], warnings);
  const returnResult = setupResult("Rückgaberichtlinien", results[3], warnings);

  const locations = (locationResult?.locations ?? [])
    .filter((item) => item.locationStatus !== "DISABLED")
    .map((item) => {
      const address = item.location?.address;
      const place = [address?.postalCode, address?.city].filter(Boolean).join(" ");
      return {
        id: item.merchantLocationKey ?? "",
        label: item.name?.trim() || item.merchantLocationKey || "Lagerort",
        detail: place || undefined,
      };
    })
    .filter((item) => item.id);

  const connection: EbayConnection = {
    ...baseConnection,
    state: "connected",
    publishReady: baseConnection.publishReady,
    label: "eBay verbunden",
    description: warnings.length
      ? `OAuth-Anmeldung funktioniert. ${warnings.length} eBay-Bereich(e) sind in der Sandbox noch nicht verfügbar.`
      : baseConnection.publishReady
        ? "Verkäuferzugang, Lagerorte und Geschäftsrichtlinien wurden gelesen."
        : `Verbindung erfolgreich. Noch offen: ${baseConnection.missingPublishingSetup.join(", ")}.`,
  };

  return {
    connection,
    settings,
    locations,
    fulfillmentPolicies: policyOptions(
      fulfillmentResult?.fulfillmentPolicies,
      "fulfillmentPolicyId"
    ),
    paymentPolicies: policyOptions(
      paymentResult?.paymentPolicies,
      "paymentPolicyId"
    ),
    returnPolicies: policyOptions(
      returnResult?.returnPolicies,
      "returnPolicyId"
    ),
    warnings,
  };
}

async function categoryTreeId(marketplaceId: string) {
  const response = await ebayRequest<{ categoryTreeId?: string }>(
    "commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=" +
      encodeURIComponent(marketplaceId)
  );
  if (!response?.categoryTreeId) {
    throw new Error("eBay hat keinen Kategoriebaum zurückgegeben.");
  }
  return response.categoryTreeId;
}

export async function suggestEbayCategories(
  query: string,
  marketplaceId: string
): Promise<EbayCategorySuggestion[]> {
  const clean = query.trim().slice(0, 350);
  if (clean.length < 2) return [];
  const treeId = await categoryTreeId(marketplaceId);
  const response = await ebayRequest<{
    categorySuggestions?: CategorySuggestionRecord[];
  }>(
    `commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      treeId
    )}/get_category_suggestions?q=${encodeURIComponent(clean)}`
  );
  return (response?.categorySuggestions ?? [])
    .map((item) => {
      const id = item.category?.categoryId ?? "";
      const name = item.category?.categoryName ?? "";
      const path = [
        ...(item.categoryTreeNodeAncestors ?? [])
          .slice()
          .reverse()
          .map((ancestor) => ancestor.categoryName)
          .filter(Boolean),
        name,
      ].join(" › ");
      return { id, name, path };
    })
    .filter((item) => item.id && item.name);
}

export async function getEbayCategoryAspects(
  categoryId: string,
  marketplaceId: string
): Promise<EbayAspect[]> {
  if (!/^\d+$/.test(categoryId)) throw new Error("Ungültige eBay-Kategorie.");
  const treeId = await categoryTreeId(marketplaceId);
  const response = await ebayRequest<{ aspects?: AspectRecord[] }>(
    `commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      treeId
    )}/get_item_aspects_for_category?category_id=${encodeURIComponent(
      categoryId
    )}`
  );
  return (response?.aspects ?? [])
    .map((item) => ({
      name: item.localizedAspectName?.trim() ?? "",
      required: item.aspectConstraint?.aspectRequired === true,
      recommended:
        item.aspectConstraint?.aspectUsage === "RECOMMENDED",
      mode:
        item.aspectConstraint?.aspectMode === "SELECTION_ONLY"
          ? ("selection_only" as const)
          : ("free_text" as const),
      values: (item.aspectValues ?? [])
        .map((value) => value.localizedValue?.trim() ?? "")
        .filter(Boolean)
        .slice(0, 500),
      maxValues:
        item.aspectConstraint?.itemToAspectCardinality === "MULTI" ? 30 : 1,
      maxLength: Math.max(0, Number(item.aspectConstraint?.aspectMaxLength) || 0),
    }))
    .filter((item) => item.name)
    .sort(
      (left, right) =>
        Number(right.required) - Number(left.required) ||
        Number(right.recommended) - Number(left.recommended) ||
        left.name.localeCompare(right.name, "de")
    );
}


type ConditionPolicyRecord = {
  itemConditions?: Array<{
    conditionId?: string | number;
    conditionDescription?: string;
    conditionHelpText?: string;
    usage?: string;
  }>;
};

const CONDITION_ENUMS: Record<string, string> = {
  "1000": "NEW",
  "1500": "NEW_OTHER",
  "1750": "NEW_WITH_DEFECTS",
  "2000": "CERTIFIED_REFURBISHED",
  "2010": "EXCELLENT_REFURBISHED",
  "2020": "VERY_GOOD_REFURBISHED",
  "2030": "GOOD_REFURBISHED",
  "2500": "SELLER_REFURBISHED",
  "2750": "LIKE_NEW",
  "2990": "PRE_OWNED_EXCELLENT",
  "3000": "USED_EXCELLENT",
  "3010": "PRE_OWNED_FAIR",
  "4000": "USED_VERY_GOOD",
  "5000": "USED_GOOD",
  "6000": "USED_ACCEPTABLE",
  "7000": "FOR_PARTS_OR_NOT_WORKING",
};

export async function getEbayCategoryConditions(
  categoryId: string,
  marketplaceId: string
): Promise<EbayConditionOption[]> {
  if (!/^\d+$/.test(categoryId)) throw new Error("Ungültige eBay-Kategorie.");
  const response = await ebayRequest<{
    itemConditionPolicies?: ConditionPolicyRecord[];
  }>(
    `sell/metadata/v1/marketplace/${encodeURIComponent(marketplaceId)}/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`
  );
  return (response?.itemConditionPolicies ?? [])
    .flatMap((policy) => policy.itemConditions ?? [])
    .map((condition) => {
      const id = String(condition.conditionId ?? "");
      return {
        id,
        value: CONDITION_ENUMS[id] ?? "",
        label: condition.conditionDescription?.trim() || id,
        helpText: condition.conditionHelpText?.trim() || undefined,
        restricted: condition.usage === "RESTRICTED",
      };
    })
    .filter((condition) => condition.id && condition.value);
}

export async function supportsNewEbayCondition(
  categoryId: string,
  marketplaceId: string
) {
  return (await getEbayCategoryConditions(categoryId, marketplaceId)).some(
    (condition) => condition.value === "NEW"
  );
}
