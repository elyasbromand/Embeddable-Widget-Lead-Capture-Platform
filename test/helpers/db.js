import { pool } from "../../src/repositories/db.js";

// The app's own pool. vitest.config.js points DATABASE_URL at the test database, so this is it.
export { pool };

// Empty the app tables before a file's tests. CASCADE follows the foreign keys
// (users -> widgets -> submissions). The migrations table and pg-boss's schema are left alone.
export async function resetDb() {
  await pool.query("TRUNCATE users, widgets, submissions RESTART IDENTITY CASCADE");
}

export async function countSubmissions() {
  const result = await pool.query("SELECT count(*)::int AS n FROM submissions");
  return result.rows[0].n;
}

export async function findSubmission(id) {
  const result = await pool.query("SELECT id, data, ip, geo, idempotency_key FROM submissions WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}
