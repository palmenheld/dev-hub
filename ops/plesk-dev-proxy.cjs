/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer, request: createRequest } = require("node:http");
const net = require("node:net");

const upstreamHost = process.env.DEV_HUB_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.DEV_HUB_UPSTREAM_PORT || 3002);
const listenHost = process.env.DEV_HUB_LISTEN_HOST || "0.0.0.0";
const listenPort = Number(process.env.PORT || 3000);
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
    `Palmenheld-Hub-Proxy läuft auf Port ${listenPort} und leitet auf ${upstreamHost}:${upstreamPort} weiter`,
  );
});
