import { pool } from "./db.js";

// widgetId and ownerId are the internal uuids from the widget row, never from the request.
//
// Idempotency: ON CONFLICT makes "does this key exist?" and "insert" ONE atomic step, enforced by
// the unique index on (widget_id, idempotency_key). With SELECT-then-INSERT, two parallel
// requests (a double-click) could both see nothing and both insert. Here the second one waits on
// the index, sees the conflict and inserts nothing.
// No key (NULL) never conflicts, so every request without one gets its own row.
// A retry gets the ORIGINAL row back, even if its data differs, so the widget must make a new key
// whenever the visitor changes the form (Step 9).
//
// geo: SQL NULL when no provider answered, never the JSON value null. JSON.stringify(null) is the
// string "null", which Postgres would store as a JSON null that `WHERE geo IS NULL` does not find.
export async function insertSubmission({ widgetId, ownerId, data, ip, geo, idempotencyKey }) {
  const inserted = await pool.query(
    `INSERT INTO submissions (widget_id, owner_id, data, ip, idempotency_key, geo)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb)
     ON CONFLICT (widget_id, idempotency_key) DO NOTHING
     RETURNING id, created_at AS "createdAt"`,
    [widgetId, ownerId, JSON.stringify(data), ip, idempotencyKey, geo ? JSON.stringify(geo) : null]
  );
  if (inserted.rows[0]) return inserted.rows[0];

  // No row returned = a retry: return the row the first attempt stored. Same two columns as the
  // unique index, so this can only find the row that blocked the insert.
  const existing = await pool.query(
    `SELECT id, created_at AS "createdAt"
     FROM submissions
     WHERE widget_id = $1 AND idempotency_key = $2`,
    [widgetId, idempotencyKey]
  );
  if (!existing.rows[0]) {
    // Only if that row was deleted between the two queries (e.g. its widget was deleted).
    // Fail honestly (500, detail in the log) rather than answer 201 with an empty body.
    throw new Error("Idempotency conflict but the original submission was not found");
  }
  return existing.rows[0];
}

// For the email worker. Not owner-scoped on purpose: the id comes from a job our own API created
// after the insert, never from a request. Returns the widget's fields too, so the worker can find
// which answer is the visitor's email address.
export async function findSubmissionForEmail(submissionId) {
  const result = await pool.query(
    `SELECT s.id, s.data, w.title AS "widgetTitle", w.fields AS "widgetFields"
     FROM submissions s
     JOIN widgets w ON w.id = s.widget_id
     WHERE s.id = $1`,
    [submissionId]
  );
  return result.rows[0] ?? null;
}

// Retention (DESIGN.md §7.2): a visitor's raw IP is personal data, kept only `days` days.
// The submission, its answers and its geo stay; only the address is cleared. Not owner-scoped on
// purpose: it is a system job over every tenant, run by the worker, never by a request.
// Returns how many rows were cleared.
export async function clearExpiredIps(days) {
  const result = await pool.query(
    `UPDATE submissions
     SET ip = NULL
     WHERE ip IS NOT NULL AND created_at < now() - make_interval(days => $1)`,
    [days]
  );
  return result.rowCount;
}
