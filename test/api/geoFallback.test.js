import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestApp, createOwner, createWidget, submit } from "../helpers/app.js";
import { createMockProvider } from "../../src/integrations/geo/mockProvider.js";
import { pool, resetDb, findSubmission } from "../helpers/db.js";

// Probe 4: geo A → B → none, through the WHOLE pipeline (HTTP → service → database), with mock
// providers injected: no network, same result every run (EVIDENCE rows 12, 13).
// test/geoService.test.js covers the chain on its own; this proves the row that ends up stored,
// which is what would have caught Step 7's `geo()` crash.
const A_RESULT = { country: "US", region: "Virginia", city: "Ashburn" };
const B_RESULT = { country: "DE", region: "Berlin", city: "Berlin" };

describe("Probe 4: geo fallback, end to end", () => {
  let token;
  beforeAll(async () => {
    await resetDb();
    ({ token } = await createOwner(makeTestApp().http));
  });
  afterAll(() => pool.end());

  async function submitWith(providers) {
    const t = makeTestApp(providers);
    const widgetId = await createWidget(t.http, token);
    const res = await submit(t.http, widgetId);
    return { t, res, row: res.status === 201 ? await findSubmission(res.body.id) : null };
  }

  it("A up: the row has A's geo and B is never called", async () => {
    const a = createMockProvider({ name: "a", result: A_RESULT });
    const b = createMockProvider({ name: "b", result: B_RESULT });
    const { res, row } = await submitWith({ providerA: a, providerB: b });

    expect(res.status).toBe(201);
    expect(row.geo).toEqual(A_RESULT);
    expect([a.calls, b.calls]).toEqual([1, 0]);
  });

  it("A down: the row has B's geo", async () => {
    const a = createMockProvider({ name: "a", mode: "down" });
    const b = createMockProvider({ name: "b", result: B_RESULT });
    const { res, row } = await submitWith({ providerA: a, providerB: b });

    expect(res.status).toBe(201);
    expect(row.geo).toEqual(B_RESULT);
    expect([a.calls, b.calls]).toEqual([1, 1]);
  });

  it("A hangs: it is cut off by the timeout and B answers", async () => {
    const a = createMockProvider({ name: "a", mode: "slow" });
    const b = createMockProvider({ name: "b", result: B_RESULT });
    const started = Date.now();
    const { res, row } = await submitWith({ providerA: a, providerB: b, geoTimeoutMs: 100 });

    expect(res.status).toBe(201);
    expect(row.geo).toEqual(B_RESULT);
    expect(Date.now() - started).toBeLessThan(2000); // did not wait forever
  });

  it("both down: still 201, the row is stored with geo NULL, and the failures are logged without the IP", async () => {
    const a = createMockProvider({ name: "a", mode: "down" });
    const b = createMockProvider({ name: "b", mode: "down" });
    const { t, res, row } = await submitWith({ providerA: a, providerB: b });

    expect(res.status).toBe(201);
    expect(row).not.toBeNull();
    expect(row.geo).toBeNull(); // SQL NULL, not the JSON value null
    const { rows } = await pool.query("SELECT geo IS NULL AS is_null FROM submissions WHERE id = $1", [row.id]);
    expect(rows[0].is_null).toBe(true);

    const warnings = t.logger.entries.filter((e) => e.level === "warn");
    expect(warnings.map((w) => w.obj.provider)).toEqual(["a", "b"]);
    expect(JSON.stringify(t.logger.entries)).not.toMatch(/8\.8\.8\.8|127\.0\.0\.1/);
  });

  it("stores the real connection IP, not the geo test IP", async () => {
    const { row } = await submitWith({});
    expect(row.ip).not.toBe("8.8.8.8");
    expect(row.ip).toMatch(/127\.0\.0\.1|::1/);
  });
});
