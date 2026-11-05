import { pool } from "./db.js";

// widgetId and ownerId are the internal uuids from the widget row, never from the request.
export async function insertSubmission({ widgetId, ownerId, data, ip }) {
  const result = await pool.query(
    `INSERT INTO submissions (widget_id, owner_id, data, ip) VALUES ($1, $2, $3::jsonb, $4) RETURNING id, created_at AS "createdAt"`,
    [widgetId, ownerId, JSON.stringify(data), ip]
  );
  return result.rows[0];
}
