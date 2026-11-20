import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestApp, createOwner, createWidget, submit, auth } from "../helpers/app.js";
import { createMockProvider } from "../../src/integrations/geo/mockProvider.js";
import { pool, resetDb } from "../helpers/db.js";

// Probe 1 through the dashboard (EVIDENCE rows 9 and 15): pagination and stats checked against
// a hand-written SQL count on the same data.
describe("Probe 1: owner dashboard", () => {
  let owner, widgetId, emptyWidgetId;

  beforeAll(async () => {
    await resetDb();
    // 5 submissions with geo DE, then 2 with both providers down (geo NULL).
    const withGeo = makeTestApp({
      providerA: createMockProvider({ name: "a", result: { country: "DE", region: "Berlin", city: "Berlin" } }),
    });
    owner = await createOwner(withGeo.http);
    widgetId = await createWidget(withGeo.http, owner.token);
    emptyWidgetId = await createWidget(withGeo.http, owner.token);
    for (let i = 0; i < 5; i++) await submit(withGeo.http, widgetId, { email: `lead${i}@example.com` });

    const noGeo = makeTestApp({
      providerA: createMockProvider({ name: "a", mode: "down" }),
      providerB: createMockProvider({ name: "b", mode: "down" }),
    });
    for (let i = 0; i < 2; i++) await submit(noGeo.http, widgetId, { email: `nogeo${i}@example.com` });
  });
  afterAll(() => pool.end());

  const { http } = makeTestApp();
  const get = (path) => http.get(path).set(auth(owner.token));

  it("pages through every submission newest first, with no repeats and no gaps", async () => {
    const seen = [];
    let cursor = null;
    let pages = 0;
    do {
      const res = await get(`/api/submissions?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3); // 3 + 3 + 1
    expect(new Set(seen.map((s) => s.id)).size).toBe(7);
    const { rows } = await pool.query(
      "SELECT id FROM submissions WHERE owner_id = $1 ORDER BY created_at DESC, id DESC",
      [owner.userId]
    );
    expect(seen.map((s) => s.id)).toEqual(rows.map((r) => r.id));
  });

  it("rejects a tampered cursor and bad query values with 422, never 500", async () => {
    for (const q of ["cursor=abc", "limit=0", "limit=101", "limit=abc", "days=0", "limt=5"]) {
      const path = q.startsWith("days") ? `/api/stats/overview?${q}` : `/api/submissions?${q}`;
      expect((await get(path)).status, q).toBe(422);
    }
  });

  it("stats match a hand-written SQL count", async () => {
    const res = await get("/api/stats/overview?days=7");
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE geo->>'country' = 'DE')::int AS de,
              count(*) FILTER (WHERE geo IS NULL)::int AS no_geo
       FROM submissions WHERE owner_id = $1`,
      [owner.userId]
    );
    const sql = rows[0];

    expect(res.body.totals).toEqual({ total: sql.total, last24h: sql.total });
    expect(res.body.byCountry).toEqual([
      { country: "DE", count: sql.de },
      { country: null, count: sql.no_geo },
    ]);
    // per widget: the empty widget is listed with 0
    expect(res.body.perWidget.map((w) => [w.widgetId, w.count])).toEqual([
      [widgetId, sql.total],
      [emptyWidgetId, 0],
    ]);
    // per day: 7 days, oldest first, empty days as 0, and every day matches SQL's own grouping
    // (compared day by day, so a run that crosses midnight UTC still passes)
    const days = res.body.perDay.counts;
    expect(days).toHaveLength(7);
    const byDay = await pool.query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int AS count
       FROM submissions WHERE owner_id = $1 GROUP BY 1`,
      [owner.userId]
    );
    const expected = Object.fromEntries(byDay.rows.map((r) => [r.day, r.count]));
    expect(days.map((d) => d.count)).toEqual(days.map((d) => expected[d.day] ?? 0));
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(sql.total);
  });
});
