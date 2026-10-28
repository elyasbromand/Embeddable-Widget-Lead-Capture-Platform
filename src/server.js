import { config } from "./config/index.js";
import { logger } from "./logger.js";
import { pool } from "./repositories/db.js";
import { createApp } from "./http/app.js";

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "API listening");
});

// Stop taking new requests, let in-flight ones finish, then release DB connections.
function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
