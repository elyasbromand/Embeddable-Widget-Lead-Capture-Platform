import { pool } from "./db.js";

// Owner dashboard reads. Every query is scoped by owner_id = $1: tenant isolation lives in the
// query, and owner_id on submissions was copied from the widget row at insert time.
// All counting and grouping happens in SQL; JavaScript only passes the rows on.
// count() returns bigint, which pg hands back as a string, so every count is cast with ::int.
//
// Never returned: ip (personal data the owner does not need), owner_id, the internal widget uuid.
// Widgets are identified by their public id.

// One page, newest first. Keyset pagination: `after` is the last row of the previous page, and
// (created_at, id) < (after) compares both columns in order, so rows with the same timestamp are
// neither skipped nor repeated. A NULL parameter switches its filter off.
// cursorTime is created_at as text: Postgres keeps microseconds, a JS Date only milliseconds.
export async function listSubmissions(ownerId, { widgetPublicId, limit, after }) {
  const result = await pool.query(
    `SELECT s.id, w.public_id AS "widgetId", s.data, s.geo, s.created_at AS "createdAt",
            s.created_at::text AS "cursorTime"
     FROM submissions s
     JOIN widgets w ON w.id = s.widget_id
     WHERE s.owner_id = $1
       AND ($2::text IS NULL OR w.public_id = $2)
       AND ($3::timestamptz IS NULL OR (s.created_at, s.id) < ($3::timestamptz, $4::uuid))
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT $5`,
    [ownerId, widgetPublicId ?? null, after?.time ?? null, after?.id ?? null, limit]
  );
  return result.rows;
}

// Both numbers in one pass over the owner's rows: FILTER counts only the rows matching it.
export async function countTotals(ownerId) {
  const result = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS "last24h"
     FROM submissions
     WHERE owner_id = $1`,
    [ownerId]
  );
  return result.rows[0];
}

// Starts from widgets and LEFT JOINs submissions, so a widget with no submissions is kept.
// count(s.id), not count(*): for that widget the joined row is all NULLs, and count(*) would say 1.
// s.owner_id = w.owner_id is always true for a matching row, but without it Postgres had no
// owner condition on submissions and read EVERY tenant's rows (EXPLAIN: Seq Scan, 100,095 rows);
// with it, the (owner_id, created_at) index reads only this owner's (5,091 rows). EVIDENCE.md row 15.
export async function countPerWidget(ownerId) {
  const result = await pool.query(
    `SELECT w.public_id AS "widgetId", w.title, count(s.id)::int AS count
     FROM widgets w
     LEFT JOIN submissions s ON s.widget_id = w.id AND s.owner_id = w.owner_id
     WHERE w.owner_id = $1
     GROUP BY w.id
     ORDER BY count DESC, w.created_at`,
    [ownerId]
  );
  return result.rows;
}

// generate_series makes one row per day (today and the days - 1 before it, UTC), and the LEFT JOIN
// keeps days with no submissions as 0. Each day matches a created_at range, which the
// (owner_id, created_at) index can serve.
export async function countPerDay(ownerId, days) {
  const result = await pool.query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(s.id)::int AS count
     FROM generate_series(
            date_trunc('day', now()) - make_interval(days => $2 - 1),
            date_trunc('day', now()),
            interval '1 day'
          ) AS d(day)
     LEFT JOIN submissions s
            ON s.owner_id = $1
           AND s.created_at >= d.day
           AND s.created_at <  d.day + interval '1 day'
     GROUP BY d.day
     ORDER BY d.day`,
    [ownerId, days]
  );
  return result.rows;
}

// Rows without geo (or without a country) are grouped under country = null, so the counts still
// add up to the total.
export async function countByCountry(ownerId) {
  const result = await pool.query(
    `SELECT geo->>'country' AS country, count(*)::int AS count
     FROM submissions
     WHERE owner_id = $1
     GROUP BY 1
     ORDER BY count DESC, country NULLS LAST`,
    [ownerId]
  );
  return result.rows;
}
