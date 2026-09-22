(() => {
  "use strict";

  const inventoryKey = "ph_inventory_draft_v2";
  const receiptKey = "ph_receipt_draft_v1";
  const inactiveKey = "ph_hide_inactive";

  function parse(key) {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Die lokal gespeicherten Daten für ${key} sind beschädigt.`);
    }
  }

  function payload() {
    return {
      version: 1,
      source: window.location.origin,
      exportedAt: new Date().toISOString(),
      inventory: parse(inventoryKey),
      receipt: parse(receiptKey),
      hideInactive: window.localStorage.getItem(inactiveKey) !== "false",
    };
  }

  function counts(data) {
    return {
      inventory: Object.keys(data.inventory?.counts || {}).length,
      receipt: Object.keys(data.receipt?.items || {}).length,
    };
  }

  const summary = document.getElementById("summary");
  const button = document.getElementById("download");

  try {
    const current = payload();
    const total = counts(current);
    summary.textContent = `${total.inventory} Inventurpositionen und ${total.receipt} Wareneingangspositionen gefunden. Die Filtereinstellung wird ebenfalls gesichert.`;
    button.addEventListener("click", () => {
      const fresh = payload();
      const blob = new Blob([JSON.stringify(fresh, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `palmenheld-lagerapp-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      summary.textContent = "Sicherung wurde heruntergeladen. Die Daten in der bisherigen Lager-App bleiben erhalten.";
    });
  } catch (error) {
    summary.textContent = error instanceof Error ? error.message : "Die lokalen Daten konnten nicht gelesen werden.";
    summary.classList.add("error");
    button.disabled = true;
  }
})();
