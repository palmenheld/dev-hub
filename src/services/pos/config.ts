const DEFAULT_BASE_URL = "https://app.posible.de";

export type PosConfig = {
  baseUrl: string;
  email: string;
  password: string;
  registerId: string;
  liveWritesEnabled: boolean;
  checkoutPinConfigured: boolean;
  receiptBaseUrl?: string;
  dataDirectory: string;
};

export function getPosConfig(): PosConfig {
  const baseUrl = (process.env.POS_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "app.posible.de") {
    throw new Error("POS_BASE_URL muss auf https://app.posible.de zeigen.");
  }

  return {
    baseUrl,
    email: process.env.POS_EMAIL?.trim() || "",
    password: process.env.POS_PASSWORD || "",
    registerId: process.env.POS_REGISTER_ID?.trim() || "",
    liveWritesEnabled: process.env.POS_LIVE_WRITES_ENABLED?.trim().toLowerCase() === "true",
    checkoutPinConfigured: /^\d{6}$/.test(process.env.POS_CHECKOUT_PIN?.trim() || ""),
    receiptBaseUrl: process.env.POS_RECEIPT_BASE_URL?.trim().replace(/\/$/, "") || undefined,
    dataDirectory: process.env.POS_DATA_DIR?.trim() || "/workspace/.data/pos",
  };
}

export function requirePosConfig() {
  const config = getPosConfig();
  if (!config.email || !config.password || !config.registerId) {
    throw new Error(
      "POS ist noch nicht vollständig eingerichtet. POS_EMAIL, POS_PASSWORD und POS_REGISTER_ID fehlen."
    );
  }
  return config;
}
