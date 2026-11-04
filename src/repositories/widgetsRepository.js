import { pool } from "./db.js";

// Tenant isolation lives HERE. Owner lookups use  WHERE owner_id = $1 AND public_id = $2,
// so another tenant's widget simply isn't found (zero rows → null/false → 404 in the service).
// createWidget takes owner_id from the token; findPublicConfig is the one deliberately public read.
//
// Rows come back in the API shape: `id` is public_id, camelCase via quoted aliases.
// The internal uuid and owner_id never leave this file.
// jsonb columns (fields, display): pass JSON.stringify(value) as the parameter.

// A missing description is stored as NULL; a missing display falls back to '{}'
// (JSON.stringify(undefined) is undefined, which pg sends as NULL).
export async function createWidget(ownerId, publicId, data) {
  const result = await pool.query(
    `INSERT INTO widgets (owner_id, public_id, type, title, description, button_text, fields, display)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, (COALESCE($8::jsonb, '{}'::jsonb)))
     RETURNING public_id AS id, type, title, description, button_text AS "buttonText",
               fields, display, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      ownerId,
      publicId,
      data.type,
      data.title,
      data.description ?? null,
      data.buttonText,
      JSON.stringify(data.fields),
      JSON.stringify(data.display),
    ]
  );
  return result.rows[0];
}

// Newest first. An owner with no widgets gets [].
export async function listWidgets(ownerId) {
  const result = await pool.query(
    `SELECT public_id AS id, type, title, description, button_text AS "buttonText",
            fields, display, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM widgets
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

// null when the widget doesn't exist OR belongs to another owner: the caller can't tell them apart.
export async function findWidget(ownerId, publicId) {
  const result = await pool.query(
    `SELECT public_id AS id, type, title, description, button_text AS "buttonText",
            fields, display, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM widgets
     WHERE owner_id = $1 AND public_id = $2`,
    [ownerId, publicId]
  );
  return result.rows[0] ?? null;
}

// A missing key keeps the stored value (COALESCE). description is the exception: null must clear
// it, and COALESCE can't tell "missing" from null, so $3 says whether the key was sent.
export async function updateWidget(ownerId, publicId, patch) {
  const result = await pool.query(
    `UPDATE widgets
     SET type        = COALESCE($1, type),
         title       = COALESCE($2, title),
         description = CASE WHEN $3 THEN $4 ELSE description END,
         button_text = COALESCE($5, button_text),
         fields      = COALESCE($6::jsonb, fields),
         display     = COALESCE($7::jsonb, display),
         updated_at  = now()
     WHERE owner_id = $8 AND public_id = $9
     RETURNING public_id AS id, type, title, description, button_text AS "buttonText",
               fields, display, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      patch.type,
      patch.title,
      "description" in patch,
      patch.description ?? null,
      patch.buttonText,
      JSON.stringify(patch.fields),
      JSON.stringify(patch.display),
      ownerId,
      publicId,
    ]
  );
  return result.rows[0] ?? null;
}

// true when a row was deleted, false when there was nothing of this owner's to delete.
export async function deleteWidget(ownerId, publicId) {
  const result = await pool.query(
    `DELETE FROM widgets WHERE owner_id = $1 AND public_id = $2`,
    [ownerId, publicId]
  );
  return result.rowCount > 0;
}

// PUBLIC lookup: no ownerId on purpose. Visitors on any site may read any widget's config.
// The column list is the security boundary: never add owner_id, the internal uuid or timestamps.
export async function findPublicConfig(publicId) {
  const result = await pool.query(
    `SELECT public_id AS id, type, title, description, button_text AS "buttonText", fields, display
     FROM widgets
     WHERE public_id = $1`,
    [publicId]
  );
  return result.rows[0] ?? null;
}
