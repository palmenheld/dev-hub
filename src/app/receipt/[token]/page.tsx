import Image from "next/image";
import { notFound } from "next/navigation";
import { getReceipt } from "@/services/pos/receiptStore";

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await getReceipt(token);
  if (!receipt) notFound();
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-sm">
        <header className="border-b bg-[var(--ph-green-dark)] p-6 text-white">
          <Image src="/logo-palmenheld.png" alt="Palmenheld" width={220} height={120} className="h-20 w-auto rounded-xl bg-white p-2" />
          <h1 className="mt-5 text-2xl">Digitaler Kassenbon</h1>
          <p className="mt-1 text-sm text-white/75">Beleg {receipt.saleId} · {new Date(receipt.createdAt).toLocaleString("de-DE")}</p>
        </header>
        <section className="p-5 sm:p-7">
          <div className="text-sm text-slate-600">{receipt.locationName} · {receipt.registerName}</div>
          <div className="mt-5 divide-y border-y">
            {receipt.lines.map((line, index) => <div key={`${line.articleNumber}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 py-4"><div><strong>{line.name}</strong><div className="text-sm text-slate-500">{line.articleNumber} · {line.quantity} × {euro.format(line.unitPrice)}</div></div><strong>{euro.format(line.lineTotal)}</strong></div>)}
          </div>
          <div className="mt-5 flex justify-between text-2xl font-bold text-[var(--ph-green-dark)]"><span>Gesamt</span><span>{euro.format(receipt.total)}</span></div>
          <div className="mt-3 flex justify-between text-sm text-slate-600"><span>{receipt.paymentMethod}</span><span>Gezahlt {euro.format(receipt.amountTendered)}</span></div>
          {receipt.change > 0 && <div className="mt-1 flex justify-between text-sm text-slate-600"><span>Rückgeld</span><span>{euro.format(receipt.change)}</span></div>}
          <a href={`/api/pos/receipts/${token}/pdf`} className="mt-7 block rounded-xl bg-[var(--ph-green-dark)] px-5 py-3 text-center font-semibold text-white">{receipt.pdfAvailable ? "Verbindlichen Originalbeleg als PDF öffnen" : "Originalbeleg jetzt aus POS laden"}</a>
          {!receipt.pdfAvailable && <p className="mt-2 text-center text-xs text-amber-800">Die POS-Rechnung wird möglicherweise noch verarbeitet. Falls nötig, bitte nach wenigen Sekunden erneut tippen.</p>}
          <p className="mt-6 text-center text-xs text-slate-400">Vielen Dank für deinen Einkauf bei Palmenheld.</p>
        </section>
      </article>
    </main>
  );
}
