"use client";

import { useState } from "react";
import { Article } from "@/types/article";

const tabs = [
  "Allgemein",
  "Bilder",
  "KI",
  "Shop",
  "eBay",
  "Kleinanzeigen",
  "Historie",
];

export default function ArticleEditor({ article }: { article: Article }) {
  const [activeTab, setActiveTab] = useState("Allgemein");
  const [name, setName] = useState(article.name);
  const [stock, setStock] = useState(String(article.stock));
  const [price, setPrice] = useState(String(article.basePrice));
  const [images, setImages] = useState<string[]>([]);

  function handleImages(files: FileList | null) {
    if (!files) return;

    const newImages = Array.from(files).map((file) =>
      URL.createObjectURL(file)
    );

    setImages((current) => [...current, ...newImages]);
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row">
        <div>
          <p className="text-sm text-slate-400">{article.sku}</p>
          <h1 className="text-3xl font-bold">{name}</h1>
          <p className="mt-1 text-slate-500">{article.subtitle}</p>
        </div>

        <div className="md:text-right">
          <p className="text-3xl font-bold text-green-800">
            {Number(price || 0).toLocaleString("de-DE", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
          <p className="text-sm text-slate-500">
            Bestand: {stock || "0"}
          </p>
        </div>
      </div>

      <nav className="mt-8 flex gap-2 overflow-x-auto border-b pb-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === tab
                ? "bg-green-800 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "Allgemein" && (
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
              label="Basispreis"
              value={price}
              onChange={setPrice}
            />
          </div>
        )}

        {activeTab === "Bilder" && (
          <div>
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-green-700">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => handleImages(event.target.files)}
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
                    <img
                      src={image}
                      alt={`Artikelbild ${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "KI" && (
          <div className="rounded-2xl bg-green-50 p-6">
            <h2 className="text-xl font-bold text-green-900">
              KI-Assistent
            </h2>

            <p className="mt-2 text-slate-600">
              Hier erstellen wir später automatisch Shoptexte,
              eBay-Texte und Kleinanzeigen-Inhalte.
            </p>

            <button className="mt-5 rounded-xl bg-green-800 px-5 py-3 font-semibold text-white">
              Text automatisch erstellen
            </button>
          </div>
        )}

        {["Shop", "eBay", "Kleinanzeigen"].includes(activeTab) && (
          <div className="rounded-2xl border p-6">
            <h2 className="text-xl font-bold">{activeTab}</h2>

            <p className="mt-2 text-slate-500">
              Kanalbezogene Inhalte und Preise werden hier gepflegt.
            </p>
          </div>
        )}

        {activeTab === "Historie" && (
          <div className="rounded-2xl border p-6 text-slate-500">
            Noch keine Änderungen protokolliert.
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <button className="rounded-xl bg-green-800 px-6 py-3 font-semibold text-white">
          Änderungen speichern
        </button>
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
        onChange={(event) => onChange?.(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-700 disabled:bg-slate-100"
      />
    </label>
  );
}
