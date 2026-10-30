import { pool } from "./db.js";

// TODO(learner, Step 3 part 6): write these five functions with parameterized SQL.
//
// Tenant isolation lives HERE. Every function except createWidget looks a widget up with
//   WHERE public_id = $1 AND owner_id = $2
// so another tenant's widget simply isn't found (zero rows → null/false → 404 in the service).
//
// Every function returns widgets in the API shape, never the raw row:
//   { id, type, title, description, buttonText, fields, display, createdAt, updatedAt }
// where `id` is public_id. The internal uuid `id` and `owner_id` never leave this file.
// Hint: alias in SQL, e.g.  public_id AS id, button_text AS "buttonText"  (quotes keep the case).
// Writing that column list once in a const saves repeating it in five queries.
//
// jsonb columns (fields, display): pass JSON.stringify(value) as the parameter.

// `data` is the validated create body: { type, title, description?, buttonText, fields, display? }.
// A missing description is stored as NULL; a missing display falls back to '{}'
// (COALESCE($n::jsonb, '{}'::jsonb) — JSON.stringify(undefined) is undefined, which pg sends as NULL).
// Returns the created widget.
export async function createWidget(ownerId, publicId, data) {
  const result = await pool.query(
    `INSERT INTO widgets (owner_id, public_id, type, title, description, button_text, fields, display) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, (COALESCE($8::jsonb, '{}'::jsonb))) RETURNING public_id AS id, type, title, description, button_text AS "buttonText", fields, display, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [ownerId, publicId, data.type, data.title, data.description ?? null, data.buttonText, JSON.stringify(data.fields), JSON.stringify(data.display)]
  );
  return result.rows[0];
}

// Returns an array of the owner's widgets, newest first. An owner with none gets [].
export async function listWidgets(ownerId) {
  const result = await pool.query(
    `SELECT public_id AS id, type, title, description, button_text AS "buttonText", fields, display, created_at AS "createdAt", updated_at AS "updatedAt" FROM widgets WHERE owner_id = $1 ORDER BY created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

// Returns the widget, or null when it doesn't exist OR belongs to another owner
// (the caller must not be able to tell those two apart).
export async function findWidget(ownerId, publicId) {
  const result = await pool.query(
    `SELECT public_id AS id, type, title, description, button_text AS "buttonText", fields, display, created_at AS "createdAt", updated_at AS "updatedAt" FROM widgets WHERE owner_id = $1 AND public_id = $2`,
    [ownerId, publicId]
  );
  return result.rows[0] ?? null;
}

// `patch` is the validated PATCH body: any non-empty subset of the create keys.
//   key missing  → keep the stored value
//   description: null → clear it (COALESCE can't tell "missing" from null; think about how to)
// Sets updated_at = now(). Returns the updated widget, or null (not found / not yours).
export async function updateWidget(ownerId, publicId, patch) {
  const result = await pool.query(
    `UPDATE widgets SET type = COALESCE($1, type), title = COALESCE($2, title), description = CASE WHEN $3 Then $4 ELSE description END, button_text = COALESCE($5, button_text), fields = COALESCE($6::jsonb, fields), display = COALESCE($7::jsonb, display), updated_at = now() WHERE owner_id = $8 AND public_id = $9 RETURNING public_id AS id, type, title, description, button_text AS "buttonText", fields, display, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [patch.type, patch.title, 'description' in patch , patch.description ?? null, patch.buttonText, JSON.stringify(patch.fields), JSON.stringify(patch.display), ownerId, publicId]
  );
  return result.rows[0] ?? null;
}

// Returns true when a row was deleted, false when there was nothing of this owner's to delete.
export async function deleteWidget(ownerId, publicId) {
  const result = await pool.query(
    "DELETE FROM widgets WHERE owner_id = $1 AND public_id = $2",
    [ownerId, publicId]
  );
  return result.rowCount > 0;
}
