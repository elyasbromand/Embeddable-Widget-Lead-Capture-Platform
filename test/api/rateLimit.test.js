import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import { makeTestApp, createOwner, createWidget, submit } from "../helpers/app.js";
import { pool, resetDb } from "../helpers/db.js";

// Probe 3: a burst gets 429 and normal traffic works again afterwards (EVIDENCE row 10).
//
// Not flaky by design:
//  - every test builds its OWN app, so its limiter counters start at zero (nothing left over from
//    another test, whatever the order)
//  - small limits and a short window (3 per 1.5 s): the burst is far from the window's end, and
//    recovery waits 1.6 s instead of a minute
//  - each window starts at that client's first request, so there is no wall-clock boundary to hit
// The production numbers (10/min per IP, 100/min per widget) are the same mechanism with other
// values; DEFAULT_RATE_LIMITS holds them.
const WINDOW_MS = 1500;

describe("Probe 3: rate limits", () => {
  let token;

  beforeAll(async () => {
    await resetDb();
    // Owner setup runs on an app with relaxed limits, so it never uses up a test's quota.
    ({ token } = await createOwner(makeTestApp().http));
  });
  afterAll(() => pool.end());

  it("per IP: the 4th request in the window gets 429 with Retry-After and CORS, then it recovers", async () => {
    const { http } = makeTestApp({ rateLimits: { windowMs: WINDOW_MS, perIp: 3, perWidget: 1000 } });
    const widgetId = await createWidget(http, token); // not /submissions, so not counted

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await submit(http, widgetId)).status);
    expect(statuses).toEqual([201, 201, 201]);

    const limited = await submit(http, widgetId);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(limited.headers["access-control-allow-origin"]).toBe("*");

    await sleep(WINDOW_MS + 100);
    expect((await submit(http, widgetId)).status).toBe(201);
  });

  it("per IP: the limit runs before the body is read, so even junk requests count", async () => {
    const { http } = makeTestApp({ rateLimits: { windowMs: WINDOW_MS, perIp: 2, perWidget: 1000 } });
    await http.post("/submissions").set("Content-Type", "application/json").send("{bad"); // 400
    await http.post("/submissions").set("Content-Type", "text/plain").send("x"); // 415
    const third = await http.post("/submissions").set("Content-Type", "application/json").send("{bad");
    expect(third.status).toBe(429);
  });

  it("per widget: one widget's cap does not block another widget", async () => {
    const { http } = makeTestApp({ rateLimits: { windowMs: WINDOW_MS, perIp: 1000, perWidget: 2 } });
    const busy = await createWidget(http, token);
    const quiet = await createWidget(http, token);

    expect((await submit(http, busy)).status).toBe(201);
    expect((await submit(http, busy)).status).toBe(201);
    expect((await submit(http, busy)).status).toBe(429);
    expect((await submit(http, quiet)).status).toBe(201);
  });

  it("preflights are never counted", async () => {
    const { http } = makeTestApp({ rateLimits: { windowMs: WINDOW_MS, perIp: 1, perWidget: 1000 } });
    const widgetId = await createWidget(http, token);
    for (let i = 0; i < 5; i++) {
      const pre = await http.options("/submissions").set("Origin", "http://localhost:5500");
      expect(pre.status).toBe(204);
    }
    expect((await submit(http, widgetId)).status).toBe(201);
  });
});
