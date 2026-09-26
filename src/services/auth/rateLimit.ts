type Attempt = { count: number; blockedUntil: number };

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function loginRateLimitKey(request: Request, username: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${username.trim().toLowerCase()}`;
}

export function assertLoginAllowed(key: string) {
  const attempt = attempts.get(key);
  if (!attempt) return;
  if (attempt.blockedUntil <= Date.now()) {
    attempts.delete(key);
    return;
  }
  if (attempt.count >= MAX_ATTEMPTS) {
    throw new Error("Zu viele fehlgeschlagene Anmeldungen. Bitte in 15 Minuten erneut versuchen.");
  }
}

export function recordFailedLogin(key: string) {
  const current = attempts.get(key);
  const count = (current?.blockedUntil && current.blockedUntil > Date.now() ? current.count : 0) + 1;
  attempts.set(key, { count, blockedUntil: Date.now() + WINDOW_MS });
  if (count < MAX_ATTEMPTS) return;
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key);
}
