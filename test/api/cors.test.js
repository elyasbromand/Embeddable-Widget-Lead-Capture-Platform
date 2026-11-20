import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestApp, createOwner, createWidget, submit } from "../helpers/app.js";
import { pool, resetDb } from "../helpers/db.js";

// Probe: cross-origin submit works and the preflight is handled (EVIDENCE rows 4 and 7).
describe("CORS", () => {
  const { http } = makeTestApp();
  let widgetId;

  beforeAll(async () => {
    await resetDb();
    const owner = await createOwner(http);
    widgetId = await createWidget(http, owner.token);
  });
  afterAll(() => pool.end());

  it("answers the preflight for POST /submissions with 204 and the allowed method and headers", async () => {
    const res = await http
      .options("/submissions")
      .set("Origin", "http://localhost:5500")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,idempotency-key");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toBe("POST, OPTIONS");
    expect(res.headers["access-control-allow-headers"]).toBe("Content-Type, Idempotency-Key");
    expect(res.headers["access-control-max-age"]).toBe("7200");
    // No credentials: the public API never uses cookies, which is what makes "*" safe.
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("puts CORS headers on a successful cross-origin POST, and exposes Retry-After", async () => {
    const res = await submit(http, widgetId);
    expect(res.status).toBe(201);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-expose-headers"]).toBe("Retry-After");
  });

  it("puts CORS headers on error responses too, so the widget can read them", async () => {
    const notFound = await submit(http, "AAAAAAAAAAAA");
    expect(notFound.status).toBe(404);
    expect(notFound.headers["access-control-allow-origin"]).toBe("*");

    const invalid = await submit(http, widgetId, { email: "not-an-email" });
    expect(invalid.status).toBe(422);
    expect(invalid.headers["access-control-allow-origin"]).toBe("*");
  });

  it("serves the public widget config to any origin, with a short cache", async () => {
    const res = await http.get(`/widgets/${widgetId}/config`).set("Origin", "http://localhost:5500");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(res.body).not.toHaveProperty("ownerId");
  });

  it("does not open the owner API to other origins", async () => {
    const res = await http.get("/api/widgets").set("Origin", "http://localhost:5500");
    expect(res.status).toBe(401);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
