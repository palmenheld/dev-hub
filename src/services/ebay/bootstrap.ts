import type {
  EbayPublishingSettings,
  EbaySandboxBootstrapInput,
  EbaySandboxBootstrapResult,
  EbaySandboxBootstrapStep,
} from "@/types/ebay";
import { EbayHttpError, ebayRequest } from "./client";
import { getEbayEnvironment } from "./config";
import { loadEbaySetup } from "./metadata";
import { getEbaySettings, saveEbaySettings } from "./store";

type ProgramRecord = { programType?: string };
type ProgramResponse = { programs?: ProgramRecord[] };
type LocationRecord = { merchantLocationKey?: string; name?: string };
type PolicyRecord = {
  name?: string;
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
};

const CATEGORY_TYPE = "ALL_EXCLUDING_MOTORS_VEHICLES";
const PROGRAM_TYPE = "SELLING_POLICY_MANAGEMENT";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unbekannter eBay-Fehler";
}

function looksAlreadyConfigured(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("already opted") ||
    message.includes("already exists") ||
    message.includes("duplicate") ||
    message.includes("already been opted")
  );
}

function step(
  key: EbaySandboxBootstrapStep["key"],
  label: string,
  status: EbaySandboxBootstrapStep["status"],
  detail: string
): EbaySandboxBootstrapStep {
  return { key, label, status, detail };
}

async function enableSellingPolicies(): Promise<EbaySandboxBootstrapStep> {
  try {
    const current = await ebayRequest<ProgramResponse>(
      "sell/account/v1/program/get_opted_in_programs"
    );
    if (
      current?.programs?.some(
        (program) => program.programType === PROGRAM_TYPE
      )
    ) {
      return step(
        "program",
        "Geschäftsrichtlinien",
        "existing",
        "Die Sandbox ist bereits für Geschäftsrichtlinien freigeschaltet."
      );
    }
  } catch {
    // In der Sandbox ist selbst die Statusabfrage zeitweise gestört. Der
    // idempotente Opt-in-Versuch darunter liefert dann das belastbare Ergebnis.
  }

  try {
    await ebayRequest("sell/account/v1/program/opt_in", {
      method: "POST",
      body: { programType: PROGRAM_TYPE },
    });
    return step(
      "program",
      "Geschäftsrichtlinien",
      "created",
      "SELLING_POLICY_MANAGEMENT wurde für den Sandbox-Verkäufer aktiviert."
    );
  } catch (error) {
    if (looksAlreadyConfigured(error)) {
      return step(
        "program",
        "Geschäftsrichtlinien",
        "existing",
        "Die Sandbox war bereits für Geschäftsrichtlinien freigeschaltet."
      );
    }
    return step(
      "program",
      "Geschäftsrichtlinien",
      "failed",
      errorMessage(error)
    );
  }
}

async function ensureLocation(input: EbaySandboxBootstrapInput) {
  const endpoint = `sell/inventory/v1/location/${encodeURIComponent(
    input.merchantLocationKey
  )}`;
  try {
    const current = await ebayRequest<LocationRecord>(endpoint, {
      allowNotFound: true,
    });
    if (current) {
      return {
        id: input.merchantLocationKey,
        result: step(
          "location",
          "Lagerort",
          "existing",
          `„${current.name || input.locationName}“ ist bereits vorhanden.`
        ),
      };
    }
  } catch {
    // Falls die Sandbox-Liste ausfällt, darf der gezielte Erstellversuch
    // trotzdem stattfinden. eBay verhindert doppelte Location-Keys.
  }

  try {
    await ebayRequest(endpoint, {
      method: "POST",
      body: {
        location: {
          address: {
            postalCode: input.postalCode,
            ...(input.city ? { city: input.city } : {}),
            country: input.country,
          },
        },
        name: input.locationName,
        merchantLocationStatus: "ENABLED",
        locationTypes: ["WAREHOUSE"],
      },
    });
    return {
      id: input.merchantLocationKey,
      result: step(
        "location",
        "Lagerort",
        "created",
        `„${input.locationName}“ wurde angelegt.`
      ),
    };
  } catch (error) {
    if (looksAlreadyConfigured(error)) {
      return {
        id: input.merchantLocationKey,
        result: step(
          "location",
          "Lagerort",
          "existing",
          `Der Lagerort-Key „${input.merchantLocationKey}“ ist bereits vorhanden.`
        ),
      };
    }
    return {
      id: "",
      result: step("location", "Lagerort", "failed", errorMessage(error)),
    };
  }
}

async function findPolicy(
  type: "fulfillment_policy" | "payment_policy" | "return_policy",
  name: string,
  marketplaceId: string
) {
  try {
    return await ebayRequest<PolicyRecord>(
      `sell/account/v1/${type}/get_by_policy_name?marketplace_id=${encodeURIComponent(
        marketplaceId
      )}&name=${encodeURIComponent(name)}`,
      { allowNotFound: true }
    );
  } catch (error) {
    if (error instanceof EbayHttpError && error.status === 404) return null;
    throw error;
  }
}

async function ensurePolicy(options: {
  key: "fulfillment" | "payment" | "return";
  label: string;
  type: "fulfillment_policy" | "payment_policy" | "return_policy";
  idKey: "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId";
  name: string;
  marketplaceId: string;
  body: Record<string, unknown>;
}) {
  let lookupError: unknown = null;
  try {
    const current = await findPolicy(
      options.type,
      options.name,
      options.marketplaceId
    );
    const id = current?.[options.idKey] || "";
    if (id) {
      return {
        id,
        result: step(
          options.key,
          options.label,
          "existing",
          `„${options.name}“ ist bereits vorhanden.`
        ),
      };
    }
  } catch (error) {
    lookupError = error;
  }

  try {
    const created = await ebayRequest<PolicyRecord>(
      `sell/account/v1/${options.type}`,
      { method: "POST", body: options.body }
    );
    const id = created?.[options.idKey] || "";
    if (!id) throw new Error("eBay hat keine Richtlinien-ID zurückgegeben.");
    return {
      id,
      result: step(
        options.key,
        options.label,
        "created",
        `„${options.name}“ wurde angelegt.`
      ),
    };
  } catch (error) {
    if (looksAlreadyConfigured(error)) {
      try {
        const current = await findPolicy(
          options.type,
          options.name,
          options.marketplaceId
        );
        const id = current?.[options.idKey] || "";
        if (id) {
          return {
            id,
            result: step(
              options.key,
              options.label,
              "existing",
              `„${options.name}“ ist bereits vorhanden.`
            ),
          };
        }
      } catch {}
    }
    const detail = errorMessage(error);
    const lookupDetail = lookupError
      ? ` Statusabfrage: ${errorMessage(lookupError)}`
      : "";
    return {
      id: "",
      result: step(
        options.key,
        options.label,
        "failed",
        `${detail}${lookupDetail}`.slice(0, 900)
      ),
    };
  }
}

export async function bootstrapEbaySandbox(
  input: EbaySandboxBootstrapInput
): Promise<EbaySandboxBootstrapResult> {
  if (getEbayEnvironment() !== "sandbox") {
    throw new Error(
      "Der automatische Assistent ist ausschließlich für die eBay-Sandbox freigegeben."
    );
  }

  const current = await getEbaySettings();
  const marketplaceId = current.marketplaceId;
  const program = await enableSellingPolicies();
  const location = await ensureLocation(input);
  const commonPolicyFields = {
    marketplaceId,
    categoryTypes: [{ name: CATEGORY_TYPE }],
  };

  const fulfillment = await ensurePolicy({
    key: "fulfillment",
    label: "Versandrichtlinie",
    type: "fulfillment_policy",
    idKey: "fulfillmentPolicyId",
    name: input.fulfillmentPolicyName,
    marketplaceId,
    body: {
      ...commonPolicyFields,
      name: input.fulfillmentPolicyName,
      description: "Vom Palmenheld Hub für die eBay-Sandbox angelegt.",
      handlingTime: { value: input.handlingDays, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            {
              sortOrder: 1,
              shippingServiceCode: input.shippingServiceCode,
              shippingCost: {
                value: input.shippingCost.toFixed(2),
                currency: current.currency,
              },
              freeShipping: input.shippingCost === 0,
            },
          ],
        },
      ],
      shipToLocations: {
        regionIncluded: [{ regionName: input.country }],
      },
    },
  });

  const payment = await ensurePolicy({
    key: "payment",
    label: "Zahlungsrichtlinie",
    type: "payment_policy",
    idKey: "paymentPolicyId",
    name: input.paymentPolicyName,
    marketplaceId,
    body: {
      ...commonPolicyFields,
      name: input.paymentPolicyName,
      description: "Vom Palmenheld Hub für die eBay-Sandbox angelegt.",
    },
  });

  const returnPolicy = await ensurePolicy({
    key: "return",
    label: "Rückgaberichtlinie",
    type: "return_policy",
    idKey: "returnPolicyId",
    name: input.returnPolicyName,
    marketplaceId,
    body: {
      ...commonPolicyFields,
      name: input.returnPolicyName,
      description: "Vom Palmenheld Hub für die eBay-Sandbox angelegt.",
      returnsAccepted: true,
      returnPeriod: { value: input.returnDays, unit: "DAY" },
      returnShippingCostPayer: input.returnShippingCostPayer,
    },
  });

  const settings: EbayPublishingSettings = {
    ...current,
    merchantLocationKey: location.id || current.merchantLocationKey,
    fulfillmentPolicyId:
      fulfillment.id || current.fulfillmentPolicyId,
    paymentPolicyId: payment.id || current.paymentPolicyId,
    returnPolicyId: returnPolicy.id || current.returnPolicyId,
  };
  await saveEbaySettings(settings);

  const steps = [
    program,
    location.result,
    fulfillment.result,
    payment.result,
    returnPolicy.result,
  ];
  return {
    completed: steps.every((item) => item.status !== "failed"),
    setup: await loadEbaySetup(),
    steps,
  };
}
