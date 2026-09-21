import { createHash, timingSafeEqual } from "node:crypto";
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");

  if (!origin || !host) {
    throw new Error("Die Aktion muss direkt aus dem Palmenheld Hub gestartet werden.");
  }

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Die Herkunft der Aktion ist ungültig.");
  }

  if (originHost.toLowerCase() !== host.toLowerCase()) {
    throw new Error("Die Aktion wurde wegen einer fremden Herkunft blockiert.");
  }
}


export function assertEbaySecurityKey(request: Request) {
  const expected = process.env.EBAY_PUBLISH_KEY?.trim();
  if (!expected) {
    throw new Error(
      "Der eBay-Sicherheitscode ist serverseitig noch nicht eingerichtet (EBAY_PUBLISH_KEY)."
    );
  }
  const provided = request.headers.get("x-palmenheld-publish-key")?.trim() || "";
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  if (!provided || !timingSafeEqual(expectedHash, providedHash)) {
    throw new Error("Der eBay-Sicherheitscode ist nicht korrekt.");
  }
}

export function assertEbayPublishKey(request: Request) {
  if (
    process.env.EBAY_ENVIRONMENT?.trim().toLowerCase() === "production" &&
    process.env.EBAY_PRODUCTION_WRITES_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    throw new Error(
      "Live-Schreibzugriffe sind serverseitig gesperrt. Erst nach einem erfolgreichen Verbindungstest EBAY_PRODUCTION_WRITES_ENABLED=true setzen."
    );
  }

  assertEbaySecurityKey(request);
}

export function assertBlogCronKey(request: Request) {
  const expected = process.env.BLOG_CRON_SECRET?.trim();
  if (!expected) {
    throw new Error(
      "Der automatische Blog-Zeitplan ist serverseitig noch nicht eingerichtet."
    );
  }
  const provided = request.headers.get("x-palmenheld-blog-cron")?.trim() || "";
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  if (!provided || !timingSafeEqual(expectedHash, providedHash)) {
    throw new Error("Der Zeitplan-Aufruf ist nicht autorisiert.");
  }
}
