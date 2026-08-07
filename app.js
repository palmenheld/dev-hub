const { createServer } = require("node:http");
const next = require("next");

const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const nextApp = next({
  dev: false,
  hostname,
  port,
});

const handle = nextApp.getRequestHandler();

nextApp
  .prepare()
  .then(() => {
    createServer((request, response) => {
      handle(request, response);
    }).listen(port, hostname, () => {
      console.log(`Palmenheld Hub läuft auf Port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Startfehler:", error);
    process.exit(1);
  });
