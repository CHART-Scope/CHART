import "./env.js";

import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3200);
const host = process.env.HOST ?? "127.0.0.1";

const app = buildApp();

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`CHART API listening on http://${host}:${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
