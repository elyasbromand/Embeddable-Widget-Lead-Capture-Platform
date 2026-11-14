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
export async function insertSubmission({ widgetId, ownerId, data, ip, idempotencyKey }) {
  const inserted = await pool.query(
    `INSERT INTO submissions (widget_id, owner_id, data, ip, idempotency_key)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (widget_id, idempotency_key) DO NOTHING
     RETURNING id, created_at AS "createdAt"`,
    [widgetId, ownerId, JSON.stringify(data), ip, idempotencyKey]
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
