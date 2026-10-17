import { weclappRequest } from "@/services/weclapp/client";
import type {
  OverwinteringAddress,
  WeclappCustomerAddressInput,
  WeclappCustomerCreateInput,
  WeclappCustomerCreateOptions,
  WeclappCustomerOption,
  WeclappCustomerSearchResult,
} from "@/types/overwintering";

type UnknownRecord = Record<string, unknown>;
type ListResponse = { result?: UnknownRecord[] };

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value === undefined || value === null
      ? ""
      : String(value).trim();
}

function clean(value: unknown, maximum = 1_000) {
  return text(value).slice(0, maximum);
}

function addressFromParty(party: UnknownRecord): OverwinteringAddress {
  const addresses = Array.isArray(party.addresses)
    ? party.addresses.map(record)
    : [];
  const deliveryAddress = record(party.deliveryAddress);
  const invoiceAddress = record(party.invoiceAddress);
  const address =
    addresses.find((item) => item.primaryAddress === true) ??
    addresses.find((item) => item.deliveryAddress === true) ??
    addresses[0] ??
    (Object.keys(deliveryAddress).length ? deliveryAddress : invoiceAddress);
  return {
    street: [text(address.street1 || address.street), text(address.street2)]
      .filter(Boolean)
      .join(", "),
    zipcode: text(address.zipcode || address.postalCode),
    city: text(address.city),
    country: text(address.countryCode || address.country) || "DE",
  };
}

function customerFromParty(
  party: UnknownRecord
): WeclappCustomerSearchResult | null {
  const id = text(party.id);
  if (!id) return null;
  return {
    id,
    customerNumber: text(party.customerNumber),
    displayName:
      text(party.company) ||
      [text(party.firstName), text(party.lastName)].filter(Boolean).join(" ") ||
      text(party.customerNumber) ||
      id,
    address: addressFromParty(party),
  };
}

async function searchField(field: string, query: string) {
  const response = await weclappRequest<ListResponse>("party", {
    query: {
      page: 1,
      pageSize: 100,
      "customer-eq": true,
      properties:
        "id,customerNumber,company,firstName,lastName,email,addresses",
      [`${field}-like`]: `%${query}%`,
    },
  });
  return response.result ?? [];
}

export async function searchWeclappCustomers(query: string) {
  const value = query.trim().slice(0, 120);
  if (value.length < 2) {
    throw new Error("Bitte mindestens zwei Zeichen für die Kundensuche eingeben.");
  }
  const terms = value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 3);
  const fields = [
    "customerNumber",
    "company",
    "firstName",
    "lastName",
    "email",
  ];
  const searches = await Promise.allSettled(
    terms.flatMap((term) =>
      fields.map((field) => searchField(field, term))
    )
  );
  const successful = searches.filter(
    (result): result is PromiseFulfilledResult<UnknownRecord[]> =>
      result.status === "fulfilled"
  );
  if (!successful.length) {
    const failure = searches.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    throw failure?.reason instanceof Error
      ? failure.reason
      : new Error("Die Weclapp-Kundensuche ist fehlgeschlagen.");
  }
  const parties = new Map<string, UnknownRecord>();
  for (const party of successful.flatMap((result) => result.value)) {
    const id = text(party.id);
    if (id) parties.set(id, party);
  }
  const normalizedTerms = terms.map((term) =>
    term.toLocaleLowerCase("de")
  );
  return [...parties.values()]
    .filter((party) => {
      const haystack = [
        text(party.customerNumber),
        text(party.company),
        text(party.firstName),
        text(party.lastName),
        text(party.email),
      ]
        .join(" ")
        .toLocaleLowerCase("de");
      return normalizedTerms.every((term) => haystack.includes(term));
    })
    .map(customerFromParty)
    .filter(
      (customer): customer is WeclappCustomerSearchResult => Boolean(customer)
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"))
    .slice(0, 100);
}

function optionLabel(row: UnknownRecord) {
  const person = [text(row.firstName), text(row.lastName)]
    .filter(Boolean)
    .join(" ");
  return (
    person ||
    text(row.name) ||
    text(row.label) ||
    text(row.description) ||
    text(row.number) ||
    text(row.code) ||
    text(row.currencyCode) ||
    text(row.username) ||
    text(row.key) ||
    text(row.id)
  );
}

async function loadOptions(endpoint: string) {
  const response = await weclappRequest<ListResponse>(endpoint, {
    query: { page: 1, pageSize: 1_000 },
  });
  return (response.result ?? [])
    .map((row): WeclappCustomerOption | null => {
      const id = text(row.id || row.key || row.code);
      if (!id) return null;
      const label = optionLabel(row);
      const details = [
        text(row.currencyCode),
        text(row.username),
        text(row.email),
      ].filter((value) => value && value !== label);
      return {
        id,
        label,
        detail: details.length ? details.join(" · ") : undefined,
      };
    })
    .filter((entry): entry is WeclappCustomerOption => Boolean(entry))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

async function settledOptions(
  label: string,
  endpoint: string,
  errors: string[]
) {
  try {
    return await loadOptions(endpoint);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auswahlwerte nicht verfügbar";
    errors.push(`${label}: ${message.slice(0, 300)}`);
    return [];
  }
}

export async function getWeclappCustomerCreateOptions(): Promise<WeclappCustomerCreateOptions> {
  const errors: string[] = [];
  const [
    commercialLanguages,
    companySizes,
    currencies,
    customerCategories,
    legalForms,
    paymentMethods,
    sectors,
    shipmentMethods,
    termsOfPayment,
    titles,
    users,
    salesChannels,
  ] = await Promise.all([
    settledOptions("Handelssprachen", "commercialLanguage", errors),
    settledOptions("Unternehmensgrößen", "companySize", errors),
    settledOptions("Währungen", "currency", errors),
    settledOptions("Kundenkategorien", "customerCategory", errors),
    settledOptions("Rechtsformen", "legalForm", errors),
    settledOptions("Zahlungsarten", "paymentMethod", errors),
    settledOptions("Branchen", "sector", errors),
    settledOptions("Versandarten", "shipmentMethod", errors),
    settledOptions("Zahlungsbedingungen", "termOfPayment", errors),
    settledOptions("Titel", "title", errors),
    settledOptions("Verantwortliche", "user", errors),
    settledOptions(
      "Vertriebswege",
      "salesChannel/activeSalesChannels",
      errors
    ),
  ]);
  return {
    commercialLanguages,
    companySizes,
    currencies,
    customerCategories,
    legalForms,
    paymentMethods,
    sectors,
    shipmentMethods,
    termsOfPayment,
    titles,
    users,
    salesChannels,
    errors,
  };
}

function normalizeAddress(
  value: WeclappCustomerAddressInput | undefined,
  label: string
) {
  const address = value ?? ({} as WeclappCustomerAddressInput);
  const normalized = {
    company: clean(address.company, 255),
    firstName: clean(address.firstName, 255),
    lastName: clean(address.lastName, 255),
    street1: clean(address.street1, 255),
    street2: clean(address.street2, 255),
    zipcode: clean(address.zipcode, 40),
    city: clean(address.city, 255),
    state: clean(address.state, 255),
    countryCode: clean(address.countryCode, 2).toUpperCase(),
    phoneNumber: clean(address.phoneNumber, 100),
  };
  if (!normalized.street1 || !normalized.zipcode || !normalized.city) {
    throw new Error(
      `${label}: Straße, Postleitzahl und Ort müssen ausgefüllt sein.`
    );
  }
  if (!/^[A-Z]{2}$/u.test(normalized.countryCode)) {
    throw new Error(`${label}: Bitte einen zweistelligen Ländercode angeben.`);
  }
  return normalized;
}

function compactRecord(value: UnknownRecord) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== "")
  );
}

function resultRow(value: UnknownRecord) {
  return record(value.result && typeof value.result === "object" ? value.result : value);
}

export async function createWeclappCustomer(
  input: Partial<WeclappCustomerCreateInput>
) {
  const partyType =
    input.partyType === "ORGANIZATION" ? "ORGANIZATION" : "PERSON";
  const company = clean(input.company, 255);
  const firstName = clean(input.firstName, 255);
  const middleName = clean(input.middleName, 255);
  const lastName = clean(input.lastName, 255);
  if (partyType === "ORGANIZATION" && !company) {
    throw new Error("Bitte den Firmennamen eintragen.");
  }
  if (partyType === "PERSON" && (!firstName || !lastName)) {
    throw new Error("Bitte Vor- und Nachname eintragen.");
  }

  const email = clean(input.email, 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error("Bitte eine gültige E-Mail-Adresse eintragen.");
  }

  const primary = normalizeAddress(input.address, "Hauptadresse");
  const useDifferentInvoiceAddress = input.useDifferentInvoiceAddress === true;
  const useDifferentDeliveryAddress = input.useDifferentDeliveryAddress === true;
  const salutationValues = new Set([
    "COMPANY",
    "FAMILY",
    "MR",
    "MRS",
    "NO_SALUTATION",
  ]);
  const salutation = salutationValues.has(input.salutation ?? "")
    ? input.salutation
    : partyType === "ORGANIZATION"
      ? "COMPANY"
      : "NO_SALUTATION";

  const addressBase = {
    company,
    firstName,
    lastName,
    salutation,
  };
  const addresses: UnknownRecord[] = [
    compactRecord({
      ...addressBase,
      ...primary,
      primaryAddress: true,
      invoiceAddress: !useDifferentInvoiceAddress,
      deliveryAddress: !useDifferentDeliveryAddress,
    }),
  ];
  if (useDifferentInvoiceAddress) {
    addresses.push(
      compactRecord({
        ...addressBase,
        ...normalizeAddress(input.invoiceAddress, "Rechnungsadresse"),
        primaryAddress: false,
        invoiceAddress: true,
        deliveryAddress: false,
      })
    );
  }
  if (useDifferentDeliveryAddress) {
    addresses.push(
      compactRecord({
        ...addressBase,
        ...normalizeAddress(input.deliveryAddress, "Lieferadresse"),
        primaryAddress: false,
        invoiceAddress: false,
        deliveryAddress: true,
      })
    );
  }

  const body: UnknownRecord = {
    customer: true,
    partyType,
    salutation,
    company,
    company2: clean(input.company2, 255),
    firstName,
    middleName,
    lastName,
    email,
    phone: clean(input.phone, 100),
    mobilePhone1: clean(input.mobilePhone1, 100),
    website: clean(input.website, 500),
    addresses,
    customerBusinessType:
      input.customerBusinessType === "B2B" ||
      input.customerBusinessType === "B2G"
        ? input.customerBusinessType
        : "B2C",
    customerSalesOrderPaymentType:
      input.customerSalesOrderPaymentType || "STANDARD",
    customerBlocked: false,
    customerDeliveryBlock: false,
    description: clean(input.description, 10_000),
    customerInternalNote: clean(input.customerInternalNote, 10_000),
    taxId: clean(input.taxId, 255),
    vatIdentificationNumber: clean(input.vatIdentificationNumber, 255),
    eoriNumber: clean(input.eoriNumber, 1_000),
    referenceNumber: clean(input.referenceNumber, 255),
    optInEmail: input.optInEmail === true,
    optInLetter: input.optInLetter === true,
    optInPhone: input.optInPhone === true,
    optInSms: input.optInSms === true,
  };

  const optionalIds = [
    "titleId",
    "commercialLanguageId",
    "companySizeId",
    "currencyId",
    "customerCategoryId",
    "customerPaymentMethodId",
    "customerShipmentMethodId",
    "customerTermOfPaymentId",
    "customerSalesChannel",
    "legalFormId",
    "responsibleUserId",
    "sectorId",
  ] as const;
  for (const key of optionalIds) {
    const value = clean(input[key], 255);
    if (value) body[key] = value;
  }
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => clean(tag, 100)).filter(Boolean).slice(0, 50)
    : [];
  if (tags.length) body.tags = tags;

  const response = await weclappRequest<UnknownRecord>("party", {
    method: "POST",
    body: compactRecord(body),
  });
  const created = resultRow(response);
  const id = text(created.id);
  if (!id) {
    throw new Error(
      "Weclapp hat den Kunden angelegt, aber keine Kunden-ID zurückgegeben."
    );
  }
  const refreshed = await weclappRequest<UnknownRecord>(
    `party/id/${encodeURIComponent(id)}`
  );
  const customer = customerFromParty(resultRow(refreshed));
  if (!customer) {
    throw new Error("Der neue Weclapp-Kunde konnte nicht zurückgelesen werden.");
  }
  return customer;
}
