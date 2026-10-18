const appVersion =
  process.env.APP_VERSION ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_VERSION ||
  "development";

export const dynamic = "force-dynamic";

export function GET() {
  const source = `
const APP_VERSION = ${JSON.stringify(appVersion)};

self.addEventListener("install", () => {
  console.info("Palmenheld Hub wird vorbereitet:", APP_VERSION);
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
`;

  return new Response(source, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
