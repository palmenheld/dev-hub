"use client";

import { useEffect, useState } from "react";
import type {
  WeclappCustomerAddressInput,
  WeclappCustomerCreateInput,
  WeclappCustomerCreateOptions,
  WeclappCustomerOption,
  WeclappCustomerSearchResult,
} from "@/types/overwintering";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none transition focus:border-[var(--ph-green-dark)] focus:ring-2 focus:ring-green-100";

type FormState = WeclappCustomerCreateInput & { tagText: string };

function address(): WeclappCustomerAddressInput {
  return {
    company: "",
    firstName: "",
    lastName: "",
    street1: "",
    street2: "",
    zipcode: "",
    city: "",
    state: "",
    countryCode: "DE",
    phoneNumber: "",
  };
}

function initialForm(query: string): FormState {
  const parts = query.trim().split(/\s+/u);
  return {
    partyType: "PERSON",
    salutation: "NO_SALUTATION",
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
    lastName: parts.length > 1 ? parts.at(-1) : query.trim(),
    company: "",
    company2: "",
    middleName: "",
    email: "",
    phone: "",
    mobilePhone1: "",
    website: "",
    address: address(),
    useDifferentInvoiceAddress: false,
    invoiceAddress: address(),
    useDifferentDeliveryAddress: false,
    deliveryAddress: address(),
    customerBusinessType: "B2C",
    customerSalesOrderPaymentType: "STANDARD",
    titleId: "",
    commercialLanguageId: "",
    companySizeId: "",
    currencyId: "",
    customerCategoryId: "",
    customerPaymentMethodId: "",
    customerShipmentMethodId: "",
    customerTermOfPaymentId: "",
    customerSalesChannel: "",
    legalFormId: "",
    responsibleUserId: "",
    sectorId: "",
    taxId: "",
    vatIdentificationNumber: "",
    eoriNumber: "",
    referenceNumber: "",
    description: "",
    customerInternalNote: "",
    tagText: "",
    optInEmail: false,
    optInLetter: false,
    optInPhone: false,
    optInSms: false,
  };
}

async function readJson<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "Die Aktion ist fehlgeschlagen.");
  }
  return payload;
}

function OptionsSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: WeclappCustomerOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-slate-800">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">Weclapp-Standard verwenden</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.detail ? ` · ${option.detail}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function AddressFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: WeclappCustomerAddressInput;
  onChange: (value: WeclappCustomerAddressInput) => void;
}) {
  function patch(change: Partial<WeclappCustomerAddressInput>) {
    onChange({ ...value, ...change });
  }
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="px-2 font-bold text-[var(--ph-green-dark)]">
        {title}
      </legend>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-bold">Firma/Empfänger</span>
          <input
            value={value.company ?? ""}
            onChange={(event) => patch({ company: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Vorname</span>
          <input
            value={value.firstName ?? ""}
            onChange={(event) => patch({ firstName: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Nachname</span>
          <input
            value={value.lastName ?? ""}
            onChange={(event) => patch({ lastName: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-bold">Straße und Hausnummer *</span>
          <input
            required
            value={value.street1}
            onChange={(event) => patch({ street1: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-bold">Adresszusatz</span>
          <input
            value={value.street2 ?? ""}
            onChange={(event) => patch({ street2: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Postleitzahl *</span>
          <input
            required
            value={value.zipcode}
            onChange={(event) => patch({ zipcode: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Ort *</span>
          <input
            required
            value={value.city}
            onChange={(event) => patch({ city: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Bundesland/Region</span>
          <input
            value={value.state ?? ""}
            onChange={(event) => patch({ state: event.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Ländercode *</span>
          <input
            required
            maxLength={2}
            value={value.countryCode}
            onChange={(event) =>
              patch({ countryCode: event.target.value.toUpperCase() })
            }
            className={inputClass}
            placeholder="DE"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-bold">Telefon an dieser Adresse</span>
          <input
            value={value.phoneNumber ?? ""}
            onChange={(event) => patch({ phoneNumber: event.target.value })}
            className={inputClass}
          />
        </label>
      </div>
    </fieldset>
  );
}

export default function WeclappCustomerCreateForm({
  query,
  onCreated,
  onCancel,
}: {
  query: string;
  onCreated: (customer: WeclappCustomerSearchResult) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(query));
  const [options, setOptions] = useState<WeclappCustomerCreateOptions | null>(
    null
  );
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/overwintering/customer-options", { cache: "no-store" })
      .then((response) =>
        readJson<{ options: WeclappCustomerCreateOptions }>(response)
      )
      .then((payload) => {
        if (active) setOptions(payload.options);
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Weclapp-Auswahlwerte konnten nicht geladen werden."
          );
        }
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function patch(change: Partial<FormState>) {
    setForm((current) => ({ ...current, ...change }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = await readJson<{
        customer: WeclappCustomerSearchResult;
      }>(
        await fetch("/api/overwintering/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            tags: form.tagText
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        })
      );
      onCreated(payload.customer);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Der Weclapp-Kunde konnte nicht angelegt werden."
      );
    } finally {
      setSaving(false);
    }
  }

  const selectOptions = options ?? {
    commercialLanguages: [],
    companySizes: [],
    currencies: [],
    customerCategories: [],
    legalForms: [],
    paymentMethods: [],
    sectors: [],
    shipmentMethods: [],
    termsOfPayment: [],
    titles: [],
    users: [],
    salesChannels: [],
    errors: [],
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-5 rounded-2xl border-2 border-amber-300 bg-amber-50/40 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl text-[var(--ph-green-dark)]">
            Neuen Kunden in Weclapp anlegen
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Die Kundennummer vergibt ausschließlich Weclapp. Der neue Kunde wird
            danach direkt für die Überwinterung ausgewählt.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold"
        >
          Abbrechen
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}
      {selectOptions.errors.length > 0 && (
        <details className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <summary className="cursor-pointer font-bold">
            Einige optionale Weclapp-Auswahllisten sind nicht verfügbar
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {selectOptions.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </details>
      )}

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-2 font-bold text-[var(--ph-green-dark)]">
          Stammdaten
        </legend>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Kundentyp *</span>
            <select
              value={form.partyType}
              onChange={(event) => {
                const partyType = event.target.value as
                  | "ORGANIZATION"
                  | "PERSON";
                patch({
                  partyType,
                  salutation:
                    partyType === "ORGANIZATION"
                      ? "COMPANY"
                      : "NO_SALUTATION",
                  customerBusinessType:
                    partyType === "ORGANIZATION" ? "B2B" : "B2C",
                });
              }}
              className={inputClass}
            >
              <option value="PERSON">Privatperson</option>
              <option value="ORGANIZATION">Unternehmen/Organisation</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Anrede</span>
            <select
              value={form.salutation}
              onChange={(event) =>
                patch({
                  salutation: event.target
                    .value as WeclappCustomerCreateInput["salutation"],
                })
              }
              className={inputClass}
            >
              <option value="NO_SALUTATION">Keine Anrede</option>
              <option value="MR">Herr</option>
              <option value="MRS">Frau</option>
              <option value="FAMILY">Familie</option>
              <option value="COMPANY">Firma</option>
            </select>
          </label>
          <OptionsSelect
            label="Titel"
            value={form.titleId}
            options={selectOptions.titles}
            onChange={(titleId) => patch({ titleId })}
          />
          {form.partyType === "ORGANIZATION" && (
            <>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-sm font-bold">Firma *</span>
                <input
                  required
                  value={form.company ?? ""}
                  onChange={(event) => patch({ company: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">Firmenzusatz</span>
                <input
                  value={form.company2 ?? ""}
                  onChange={(event) => patch({ company2: event.target.value })}
                  className={inputClass}
                />
              </label>
            </>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Vorname *</span>
            <input
              required={form.partyType === "PERSON"}
              value={form.firstName ?? ""}
              onChange={(event) => patch({ firstName: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Weitere Vornamen</span>
            <input
              value={form.middleName ?? ""}
              onChange={(event) => patch({ middleName: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Nachname *</span>
            <input
              required={form.partyType === "PERSON"}
              value={form.lastName ?? ""}
              onChange={(event) => patch({ lastName: event.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-2 font-bold text-[var(--ph-green-dark)]">
          Kontakt
        </legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">E-Mail</span>
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(event) => patch({ email: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Telefon</span>
            <input
              type="tel"
              value={form.phone ?? ""}
              onChange={(event) => patch({ phone: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Mobil</span>
            <input
              type="tel"
              value={form.mobilePhone1 ?? ""}
              onChange={(event) => patch({ mobilePhone1: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Webseite</span>
            <input
              type="url"
              value={form.website ?? ""}
              onChange={(event) => patch({ website: event.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <AddressFields
        title="Hauptadresse"
        value={form.address}
        onChange={(value) => patch({ address: value })}
      />

      <div className="space-y-3">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 font-bold">
          <input
            type="checkbox"
            checked={form.useDifferentInvoiceAddress === true}
            onChange={(event) =>
              patch({ useDifferentInvoiceAddress: event.target.checked })
            }
          />
          Abweichende Rechnungsadresse
        </label>
        {form.useDifferentInvoiceAddress && (
          <AddressFields
            title="Rechnungsadresse"
            value={form.invoiceAddress ?? address()}
            onChange={(value) => patch({ invoiceAddress: value })}
          />
        )}
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 font-bold">
          <input
            type="checkbox"
            checked={form.useDifferentDeliveryAddress === true}
            onChange={(event) =>
              patch({ useDifferentDeliveryAddress: event.target.checked })
            }
          />
          Abweichende Lieferadresse
        </label>
        {form.useDifferentDeliveryAddress && (
          <AddressFields
            title="Lieferadresse"
            value={form.deliveryAddress ?? address()}
            onChange={(value) => patch({ deliveryAddress: value })}
          />
        )}
      </div>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-2 font-bold text-[var(--ph-green-dark)]">
          Vertriebs- und Finanzdaten
        </legend>
        {loadingOptions && (
          <p className="mb-3 text-sm text-slate-500">
            Weclapp-Auswahlwerte werden geladen …
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Geschäftsart</span>
            <select
              value={form.customerBusinessType}
              onChange={(event) =>
                patch({
                  customerBusinessType: event.target
                    .value as WeclappCustomerCreateInput["customerBusinessType"],
                })
              }
              className={inputClass}
            >
              <option value="B2C">Privatkunde (B2C)</option>
              <option value="B2B">Geschäftskunde (B2B)</option>
              <option value="B2G">Öffentliche Hand (B2G)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Auftrags-Zahlungsart</span>
            <select
              value={form.customerSalesOrderPaymentType}
              onChange={(event) =>
                patch({
                  customerSalesOrderPaymentType: event.target
                    .value as WeclappCustomerCreateInput["customerSalesOrderPaymentType"],
                })
              }
              className={inputClass}
            >
              <option value="STANDARD">Standard</option>
              <option value="ADVANCE_PAYMENT">Vorauszahlung</option>
              <option value="PREPAYMENT">Anzahlung</option>
              <option value="PART_PAYMENT">Teilzahlung</option>
              <option value="COUNTER_SALES">Barverkauf</option>
            </select>
          </label>
          <OptionsSelect
            label="Kundenkategorie"
            value={form.customerCategoryId}
            options={selectOptions.customerCategories}
            onChange={(customerCategoryId) => patch({ customerCategoryId })}
          />
          <OptionsSelect
            label="Handelssprache"
            value={form.commercialLanguageId}
            options={selectOptions.commercialLanguages}
            onChange={(commercialLanguageId) => patch({ commercialLanguageId })}
          />
          <OptionsSelect
            label="Währung"
            value={form.currencyId}
            options={selectOptions.currencies}
            onChange={(currencyId) => patch({ currencyId })}
          />
          <OptionsSelect
            label="Zahlungsart"
            value={form.customerPaymentMethodId}
            options={selectOptions.paymentMethods}
            onChange={(customerPaymentMethodId) =>
              patch({ customerPaymentMethodId })
            }
          />
          <OptionsSelect
            label="Zahlungsbedingung"
            value={form.customerTermOfPaymentId}
            options={selectOptions.termsOfPayment}
            onChange={(customerTermOfPaymentId) =>
              patch({ customerTermOfPaymentId })
            }
          />
          <OptionsSelect
            label="Versandart"
            value={form.customerShipmentMethodId}
            options={selectOptions.shipmentMethods}
            onChange={(customerShipmentMethodId) =>
              patch({ customerShipmentMethodId })
            }
          />
          <OptionsSelect
            label="Vertriebsweg"
            value={form.customerSalesChannel}
            options={selectOptions.salesChannels}
            onChange={(customerSalesChannel) => patch({ customerSalesChannel })}
          />
          <OptionsSelect
            label="Verantwortlicher"
            value={form.responsibleUserId}
            options={selectOptions.users}
            onChange={(responsibleUserId) => patch({ responsibleUserId })}
          />
          <OptionsSelect
            label="Branche"
            value={form.sectorId}
            options={selectOptions.sectors}
            onChange={(sectorId) => patch({ sectorId })}
          />
          {form.partyType === "ORGANIZATION" && (
            <>
              <OptionsSelect
                label="Rechtsform"
                value={form.legalFormId}
                options={selectOptions.legalForms}
                onChange={(legalFormId) => patch({ legalFormId })}
              />
              <OptionsSelect
                label="Unternehmensgröße"
                value={form.companySizeId}
                options={selectOptions.companySizes}
                onChange={(companySizeId) => patch({ companySizeId })}
              />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-2 font-bold text-[var(--ph-green-dark)]">
          Steuer, Zuordnung und interne Angaben
        </legend>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Steuernummer</span>
            <input
              value={form.taxId ?? ""}
              onChange={(event) => patch({ taxId: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">USt-IdNr.</span>
            <input
              value={form.vatIdentificationNumber ?? ""}
              onChange={(event) =>
                patch({ vatIdentificationNumber: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">EORI-Nummer</span>
            <input
              value={form.eoriNumber ?? ""}
              onChange={(event) => patch({ eoriNumber: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Referenznummer</span>
            <input
              value={form.referenceNumber ?? ""}
              onChange={(event) => patch({ referenceNumber: event.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-sm font-bold">
              Tags (kommagetrennt)
            </span>
            <input
              value={form.tagText}
              onChange={(event) => patch({ tagText: event.target.value })}
              className={inputClass}
              placeholder="z. B. Überwinterung, Privatkunde"
            />
          </label>
          <label className="block md:col-span-2 xl:col-span-3">
            <span className="mb-1.5 block text-sm font-bold">Beschreibung</span>
            <textarea
              value={form.description ?? ""}
              onChange={(event) => patch({ description: event.target.value })}
              className={`${inputClass} min-h-24 resize-y`}
            />
          </label>
          <label className="block md:col-span-2 xl:col-span-3">
            <span className="mb-1.5 block text-sm font-bold">Interne Notiz</span>
            <textarea
              value={form.customerInternalNote ?? ""}
              onChange={(event) =>
                patch({ customerInternalNote: event.target.value })
              }
              className={`${inputClass} min-h-24 resize-y`}
              placeholder="Nur intern in Weclapp sichtbar"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["optInEmail", "E-Mail erlaubt"],
            ["optInPhone", "Telefon erlaubt"],
            ["optInSms", "SMS erlaubt"],
            ["optInLetter", "Briefpost erlaubt"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold"
            >
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof FormState])}
                onChange={(event) =>
                  patch({ [key]: event.target.checked } as Partial<FormState>)
                }
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {saving ? "Kunde wird in Weclapp angelegt …" : "Kunde in Weclapp anlegen & auswählen"}
        </button>
      </div>
    </form>
  );
}
