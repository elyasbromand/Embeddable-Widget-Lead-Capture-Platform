import { pool } from "./db.js";

// Cheapest possible round trip: proves the pool can get a connection and Postgres answers.
export async function ping() {
  await pool.query("SELECT 1");
}
