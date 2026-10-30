import { pool } from "./db.js";

// Inserts a user. Returns { id, email }, or null when the email is already taken.
export async function createUser(email, passwordHash) {
  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id, email",
    [email, passwordHash],
  );
  return result.rows[0] ?? null;
}

// Returns { id, email, password_hash }, or null when no user has this email.
// The one place password_hash leaves the database; it must never reach a response.
export async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email],
  );
  return result.rows[0] ?? null;
}
