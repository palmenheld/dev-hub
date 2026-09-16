/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer, request: createRequest } = require("node:http");
const { timingSafeEqual } = require("node:crypto");
const { readFileSync } = require("node:fs");
const net = require("node:net");

const upstreamHost = process.env.DEV_HUB_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.DEV_HUB_UPSTREAM_PORT || 3002);
const listenHost = process.env.DEV_HUB_LISTEN_HOST || "0.0.0.0";
const listenPort = Number(process.env.PORT || 3000);
const credentialsFile =
  process.env.DEV_HUB_CREDENTIALS_FILE ||
  "/var/www/vhosts/palmenheld.de/dev-hub.palmenheld.de/.dev-hub-basic-auth.env";

function readCredentials() {
  const entries = Object.fromEntries(
    readFileSync(credentialsFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator === -1
          ? [line, ""]
          : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );

  const username = entries.DEV_HUB_BASIC_AUTH_USER;
  const password = entries.DEV_HUB_BASIC_AUTH_PASSWORD;
  if (!username || !password) {
    throw new Error(`Zugangsdaten fehlen in ${credentialsFile}`);
  }

  return Buffer.from(`${username}:${password}`, "utf8");
}

const expectedCredentials = readCredentials();

function isAuthorized(request) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) return false;

  let received;
  try {
    received = Buffer.from(header.slice(6), "base64");
  } catch {
    return false;
  }

  return (
    received.length === expectedCredentials.length &&
    timingSafeEqual(received, expectedCredentials)
  );
}

function requireAuthentication(response) {
  response.writeHead(401, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Palmenheld Hub Test", charset="UTF-8"',
  });
  response.end("Anmeldung erforderlich");
}

function forwardedHeaders(request) {
  const headers = { ...request.headers };
  delete headers.authorization;
  headers.host = request.headers.host || "dev-hub.palmenheld.de";
  headers["x-forwarded-host"] = headers.host;
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-for"] = request.socket.remoteAddress || "";
  return headers;
}

const server = createServer((incoming, outgoing) => {
  if (!isAuthorized(incoming)) {
    requireAuthentication(outgoing);
    return;
  }

  const upstream = createRequest(
    {
      hostname: upstreamHost,
      port: upstreamPort,
      path: incoming.url,
      method: incoming.method,
      headers: forwardedHeaders(incoming),
    },
    (response) => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    },
  );

  upstream.on("error", (error) => {
    console.error("Dev-Hub-Upstream nicht erreichbar:", error);
    if (!outgoing.headersSent) {
      outgoing.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    outgoing.end("Die Testversion ist momentan nicht erreichbar.");
  });

  incoming.pipe(upstream);
});

server.on("upgrade", (request, socket, head) => {
  if (!isAuthorized(request)) {
    socket.end(
      "HTTP/1.1 401 Unauthorized\r\n" +
        'WWW-Authenticate: Basic realm="Palmenheld Hub Test"\r\n' +
        "Connection: close\r\n\r\n",
    );
    return;
  }

  const upstream = net.connect(upstreamPort, upstreamHost, () => {
    const headers = forwardedHeaders(request);
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${name}: ${item}`);
      } else if (value !== undefined) {
        lines.push(`${name}: ${value}`);
      }
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => socket.destroy());
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `Geschützter Palmenheld-Hub-Proxy läuft auf Port ${listenPort} und leitet auf ${upstreamHost}:${upstreamPort} weiter`,
  );
});
