import { createHmac, timingSafeEqual } from "node:crypto";
import type { HubSessionPayload, PublicHubUser } from "@/types/auth";

export const SESSION_COOKIE_NAME = "palmenheld_hub_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function sessionSecret() {
  const secret = process.env.HUB_SESSION_SECRET?.trim() || "";
  if (secret.length < 32 || secret.startsWith("replace-with")) {
    throw new Error("HUB_SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen.");
  }
  return secret;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

export function createSessionToken(user: PublicHubUser) {
  const payload: HubSessionPayload = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token: string | undefined | null): HubSessionPayload | null {
  if (!token) return null;
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  try {
    const expected = Buffer.from(sign(encodedPayload));
    const provided = Buffer.from(providedSignature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as HubSessionPayload;
    if (!payload.sub || !payload.username || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (payload.role !== "admin" && payload.role !== "editor") return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function requestUsesHttps(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded === "https" || new URL(request.url).protocol === "https:";
}
