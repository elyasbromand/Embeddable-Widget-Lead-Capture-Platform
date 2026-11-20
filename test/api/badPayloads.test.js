import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestApp, createOwner, createWidget } from "../helpers/app.js";
import { pool, resetDb, countSubmissions } from "../helpers/db.js";

// Probe 2: malformed and oversized payloads are rejected with a 4xx JSON envelope, never a 500,
// never a stored row (EVIDENCE row 8, S2).
describe("Probe 2: bad payloads on POST /submissions", () => {
  const { http } = makeTestApp();
  let widgetId;

  beforeAll(async () => {
    await resetDb();
    const owner = await createOwner(http);
    widgetId = await createWidget(http, owner.token);
  });
  afterAll(() => pool.end());

  // Raw request so the test controls the exact bytes and Content-Type.
  const post = (body, contentType = "application/json") =>
    http.post("/submissions").set("Origin", "http://localhost:5500").set("Content-Type", contentType).send(body);

  const cases = [
    { name: "malformed JSON", body: () => "{bad", status: 400, code: "BAD_REQUEST" },
    {
      name: "body over 10 kB",
      body: () => JSON.stringify({ widgetId, fields: { email: "x@example.com", first_name: "a".repeat(11_000) } }),
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    },
    {
      name: "text/plain content type",
      body: () => JSON.stringify({ widgetId, fields: { email: "x@example.com" } }),
      contentType: "text/plain",
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    },
    { name: "invalid email field", body: () => JSON.stringify({ widgetId, fields: { email: "not-an-email" } }), status: 422, code: "VALIDATION_FAILED" },
    { name: "missing required field", body: () => JSON.stringify({ widgetId, fields: {} }), status: 422, code: "VALIDATION_FAILED" },
    { name: "unknown field", body: () => JSON.stringify({ widgetId, fields: { email: "x@example.com", admin: true } }), status: 422, code: "VALIDATION_FAILED" },
    { name: "body is a JSON array", body: () => "[]", status: 422, code: "VALIDATION_FAILED" },
    { name: "unknown widget", body: () => JSON.stringify({ widgetId: "AAAAAAAAAAAA", fields: { email: "x@example.com" } }), status: 404, code: "NOT_FOUND" },
    { name: "malformed widget id", body: () => JSON.stringify({ widgetId: "<script>", fields: { email: "x@example.com" } }), status: 404, code: "NOT_FOUND" },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.status} ${c.code}, with CORS, no row stored`, async () => {
      const before = await countSubmissions();
      const res = await post(c.body(), c.contentType);

      expect(res.status).toBe(c.status);
      expect(res.headers["content-type"]).toMatch(/^application\/json/);
      expect(res.body.error.code).toBe(c.code);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(await countSubmissions()).toBe(before);
    });
  }

  it("never echoes the rejected value back in a 422", async () => {
    const res = await post(JSON.stringify({ widgetId, fields: { email: "<img src=x onerror=alert(1)>" } }));
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain("onerror");
  });
});
