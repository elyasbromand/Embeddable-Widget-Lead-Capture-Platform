import pg from "pg";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

// One pool for the whole process. Lives in repositories/ because only repositories run SQL.
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10, // well under Postgres' default max_connections (100), leaves room for the worker and psql
  idleTimeoutMillis: 30_000, // close connections unused for 30s
  connectionTimeoutMillis: 5_000, // fail instead of waiting forever when the pool or DB is stuck
});

// An idle client can error (e.g. Postgres restarts). Without a listener, Node crashes the process.
pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle Postgres client");
});
