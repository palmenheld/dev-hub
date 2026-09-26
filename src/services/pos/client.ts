import { requirePosConfig } from "@/services/pos/config";

type JsonRecord = Record<string, unknown>;

let sessionCookie = "";
let loginPromise: Promise<void> | null = null;

function cookieFromResponse(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() || (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
  return values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function login() {
  const config = requirePosConfig();
  const response = await fetch(`${config.baseUrl}/pos/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ action: "login", email: config.email, password: config.password }),
    cache: "no-store",
  });
  const result = (await response.json().catch(() => null)) as JsonRecord | null;
  const cookie = cookieFromResponse(response);
  if (!response.ok || result?.success !== true || !cookie) {
    throw new Error("Die Anmeldung bei weclappPOS ist fehlgeschlagen.");
  }
  sessionCookie = cookie;

  const selected = await rawPost("/getPos", { action: "setPos", idPos: config.registerId });
  if (selected.success !== true) {
    sessionCookie = "";
    throw new Error("Die konfigurierte POS-Kasse konnte nicht ausgewählt werden.");
  }
}

async function ensureLogin() {
  if (sessionCookie) return;
  if (!loginPromise) loginPromise = login().finally(() => { loginPromise = null; });
  await loginPromise;
}

function addFormValue(form: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => addFormValue(form, `${key}[${index}]`, entry));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value as JsonRecord).forEach(([child, entry]) => addFormValue(form, `${key}[${child}]`, entry));
    return;
  }
  form.append(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
}

function encodeForm(payload: JsonRecord) {
  const form = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => addFormValue(form, key, value));
  return form;
}

async function rawPost(path: string, payload: JsonRecord) {
  const config = requirePosConfig();
  const response = await fetch(`${config.baseUrl}/pos${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      cookie: sessionCookie,
      "x-requested-with": "XMLHttpRequest",
    },
    body: encodeForm(payload),
    cache: "no-store",
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`weclappPOS antwortet mit HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) throw new Error("Die POS-Sitzung ist abgelaufen.");
  return (await response.json()) as JsonRecord;
}

export async function posPost(path: string, payload: JsonRecord, retry = true): Promise<JsonRecord> {
  await ensureLogin();
  try {
    const result = await rawPost(path, payload);
    if (result.success !== true) {
      const messages = Array.isArray(result.messages)
        ? result.messages.map((entry) => typeof entry === "object" && entry ? String((entry as JsonRecord).text || "") : "").filter(Boolean)
        : [];
      throw new Error(messages.join(" ") || "weclappPOS hat die Aktion abgelehnt.");
    }
    return result;
  } catch (error) {
    if (!retry || !(error instanceof Error) || !/Sitzung|HTTP 401|HTTP 403/.test(error.message)) throw error;
    sessionCookie = "";
    await ensureLogin();
    return posPost(path, payload, false);
  }
}

export async function posGet(path: string) {
  await ensureLogin();
  const config = requirePosConfig();
  const response = await fetch(`${config.baseUrl}/pos${path}`, {
    headers: { cookie: sessionCookie, accept: "application/pdf" },
    cache: "no-store",
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`Der POS-Beleg ist noch nicht verfügbar (HTTP ${response.status}).`);
  return response;
}

export function resetPosSession() {
  sessionCookie = "";
}
