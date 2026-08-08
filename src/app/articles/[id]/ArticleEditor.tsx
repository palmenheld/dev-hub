"use client";

import { useState } from "react";
import { Article } from "@/types/article";

const tabs = [
  "Allgemein",
  "Preise",
  "Bilder",
  "KI",
  "Shop",
  "eBay",
  "Kleinanzeigen",
  "Historie",
];

export default function ArticleEditor({
  article,
}: {
  article: Article;
}) {
  const [activeTab, setActiveTab] = useState("Allgemein");

  const [name, setName] = useState(article.name);
  const [stock, setStock] = useState(String(article.stock));

  const [price, setPrice] = useState(
    String(article.basePrice)
  );

  const [savingPrice, setSavingPrice] = useState(false);
  const [priceMessage, setPriceMessage] = useState<string | null>(
    null
  );
  const [priceSuccess, setPriceSuccess] = useState(false);

  const [images, setImages] = useState<string[]>([]);

  function handleImages(files: FileList | null) {
    if (!files) return;

    const newImages = Array.from(files).map((file) =>
      URL.createObjectURL(file)
    );

    setImages((current) => [
      ...current,
      ...newImages,
    ]);
  }

  function parsePrice(value: string) {
    return Number(
      value
        .trim()
        .replace(/\./g, "")
        .replace(",", ".")
    );
  }

  function formatPrice(value: string) {
    const numericValue = parsePrice(value);

    if (!Number.isFinite(numericValue)) {
      return "0,00 €";
    }

    return numericValue.toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });
  }

  async function saveGross1Price() {
    const numericPrice = parsePrice(price);

    if (
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      setPriceSuccess(false);
      setPriceMessage(
        "Bitte einen gültigen Verkaufspreis eingeben."
      );

      return;
    }

    try {
      setSavingPrice(true);
      setPriceMessage(null);
      setPriceSuccess(false);

      const response = await fetch(
        `/api/articles/${article.id}/price`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            price: numericPrice,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ??
            "Der Preis konnte nicht gespeichert werden."
        );
      }

      setPrice(String(numericPrice));

      setPriceSuccess(true);
      setPriceMessage(
        "Gross1 wurde erfolgreich in Weclapp gespeichert."
      );
    } catch (error) {
      setPriceSuccess(false);

      setPriceMessage(
        error instanceof Error
          ? error.message
          : "Beim Speichern ist ein unbekannter Fehler aufgetreten."
      );
    } finally {
      setSavingPrice(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
      {/* Kopfbereich */}
      <div className="flex flex-col justify-between gap-4 md:flex-row">
        <div>
          <p className="text-sm text-slate-400">
            {article.sku}
          </p>

          <h1 className="text-3xl font-bold">
            {name}
          </h1>

          <p className="mt-1 text-slate-500">
            {article.subtitle}
          </p>

          {!article.active && (
            <span className="mt-3 inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
              Inaktiver Artikel
            </span>
          )}
        </div>

        <div className="md:text-right">
          <p className="text-3xl font-bold text-[var(--ph-green-dark)]">
            {formatPrice(price)}
          </p>

          <p className="text-sm text-slate-500">
            Gross1
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Bestand: {stock || "0"}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-8 flex gap-2 overflow-x-auto border-b pb-3">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-[var(--ph-green-dark)] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {/* ALLGEMEIN */}
        {activeTab === "Allgemein" && (
          <div>
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Artikelnummer"
                value={article.sku}
                disabled
              />

              <Field
                label="Artikelname"
                value={name}
                onChange={setName}
              />

              <Field
                label="Bestand"
                value={stock}
                onChange={setStock}
              />

              <Field
                label="Status"
                value={
                  article.active
                    ? "Aktiv"
                    : "Inaktiv"
                }
                disabled
              />
            </div>

            <p className="mt-5 text-xs text-slate-500">
              Änderungen an Stammdaten und Bestand werden
              momentan noch nicht an Weclapp übertragen.
            </p>
          </div>
        )}

        {/* PREISE */}
        {activeTab === "Preise" && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-2xl border border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-semibold text-[var(--ph-gold)]">
                    Weclapp
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-[var(--ph-green-dark)]">
                    Gross1
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    Dieser Preis ist der
                    Palmenheld-Basisverkaufspreis.
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                  Führender Preis
                </span>
              </div>

              <div className="mt-7">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Verkaufspreis
                  </span>

                  <div className="relative">
                    <input
                      value={price}
                      inputMode="decimal"
                      onChange={(event) => {
                        setPrice(event.target.value);
                        setPriceMessage(null);
                        setPriceSuccess(false);
                      }}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-lg font-semibold outline-none focus:border-[var(--ph-green-dark)]"
                    />

                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                      €
                    </span>
                  </div>
                </label>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    disabled={savingPrice}
                    onClick={saveGross1Price}
                    className="rounded-xl bg-[var(--ph-green-dark)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--ph-green)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPrice
                      ? "Speichere..."
                      : "Gross1 speichern"}
                  </button>

                  <span className="text-sm text-slate-500">
                    Wird direkt in Weclapp geändert.
                  </span>
                </div>

                {priceMessage && (
                  <div
                    className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                      priceSuccess
                        ? "border-green-200 bg-green-50 text-green-800"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {priceMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Kanalpreise */}
            <div className="space-y-3">
              <h3 className="font-bold text-slate-800">
                Verkaufskanäle
              </h3>

              <ChannelPriceCard
                title="Palmenheld Shop"
                description="Noch keine Preisregel eingerichtet"
              />

              <ChannelPriceCard
                title="eBay"
                description="Noch keine Preisregel eingerichtet"
              />

              <ChannelPriceCard
                title="Kleinanzeigen"
                description="Noch keine Preisregel eingerichtet"
              />

              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Im nächsten Schritt können wir aus Gross1
                automatisch kanalabhängige Preise berechnen.
              </div>
            </div>
          </div>
        )}

        {/* BILDER */}
        {activeTab === "Bilder" && (
          <div>
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-[var(--ph-green-dark)]">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) =>
                  handleImages(
                    event.target.files
                  )
                }
              />

              <div className="text-lg font-semibold">
                Bilder hinzufügen
              </div>

              <div className="mt-1 text-sm text-slate-500">
                Vom Computer oder Smartphone auswählen
              </div>
            </label>

            {images.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                {images.map((image, index) => (
                  <div
                    key={image}
                    className="overflow-hidden rounded-xl border bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={`Artikelbild ${
                        index + 1
                      }`}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* KI */}
        {activeTab === "KI" && (
          <div className="rounded-2xl bg-green-50 p-6">
            <h2 className="text-xl font-bold text-green-900">
              KI-Assistent
            </h2>

            <p className="mt-2 text-slate-600">
              Hier erstellen wir später automatisch
              Shoptexte, eBay-Texte und
              Kleinanzeigen-Inhalte.
            </p>

            <button
              type="button"
              className="mt-5 rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 font-semibold text-white"
            >
              Text automatisch erstellen
            </button>
          </div>
        )}

        {/* VERKAUFSKANÄLE */}
        {["Shop", "eBay", "Kleinanzeigen"].includes(
          activeTab
        ) && (
          <div className="rounded-2xl border p-6">
            <h2 className="text-xl font-bold">
              {activeTab}
            </h2>

            <p className="mt-2 text-slate-500">
              Kanalbezogene Inhalte, Preise und
              Veröffentlichungen werden hier gepflegt.
            </p>
          </div>
        )}

        {/* HISTORIE */}
        {activeTab === "Historie" && (
          <div className="rounded-2xl border p-6 text-slate-500">
            Noch keine Änderungen protokolliert.
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">
        {label}
      </span>

      <input
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange?.(event.target.value)
        }
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[var(--ph-green-dark)] disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function ChannelPriceCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold">
            {title}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            {description}
          </div>
        </div>

        <div className="text-lg font-bold text-slate-400">
          —
        </div>
      </div>
    </div>
  );
}
