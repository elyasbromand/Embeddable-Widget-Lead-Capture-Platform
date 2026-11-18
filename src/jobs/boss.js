import { PgBoss } from "pg-boss";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

// pg-boss keeps its jobs in Postgres (its own `pgboss` schema), so a job survives restarts
// and is stored in the same database as the submission it is about.
export function createBoss({ role }) {
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    // Only the worker runs pg-boss maintenance (expiring, archiving, retry bookkeeping).
    // The API only sends jobs, so it skips that work.
    supervise: role === "worker",
    schedule: role === "worker",
  });
  // Without a listener, an 'error' event would crash the process.
  boss.on("error", (err) => logger.error({ err, role }, "pg-boss error"));
  return boss;
}
