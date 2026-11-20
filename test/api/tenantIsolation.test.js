import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestApp, createOwner, createWidget, submit, auth } from "../helpers/app.js";
import { pool, resetDb } from "../helpers/db.js";

// Tenant A cannot read or change tenant B's widgets or submissions (EVIDENCE rows 1 and 2).
// Another tenant's resource is a 404 with the SAME body as one that does not exist, so B cannot
// even learn that A's id is real. And B's attempts must leave A's data unchanged.
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Widget not found" } };
const MISSING_ID = "AAAAAAAAAAAA"; // valid format, never issued

describe("tenant isolation", () => {
  const { http } = makeTestApp();
  let a, b, aWidget, bWidget, aSubmissionId;

  beforeAll(async () => {
    await resetDb();
    a = await createOwner(http, "tenant-a");
    b = await createOwner(http, "tenant-b");
    aWidget = await createWidget(http, a.token);
    bWidget = await createWidget(http, b.token);
    aSubmissionId = (await submit(http, aWidget, { email: "lead-of-a@example.com" })).body.id;
    await submit(http, bWidget, { email: "lead-of-b@example.com" });
  });
  afterAll(() => pool.end());

  describe("authentication", () => {
    it.each([
      ["GET", "/api/widgets"],
      ["POST", "/api/widgets"],
      ["GET", "/api/submissions"],
      ["GET", "/api/stats/overview"],
    ])("%s %s without a token → 401", async (method, path) => {
      const res = await http[method.toLowerCase()](path);
      expect(res.status).toBe(401);
    });

    it("a forged token → 401", async () => {
      const forged = a.token.slice(0, -4) + "AAAA";
      expect((await http.get("/api/widgets").set(auth(forged))).status).toBe(401);
    });
  });

  describe("widgets", () => {
    it("B's list does not contain A's widget", async () => {
      const res = await http.get("/api/widgets").set(auth(b.token));
      expect(res.status).toBe(200);
      expect(res.body.map((w) => w.id)).toEqual([bWidget]);
    });

    it("B reading A's widget gets the same 404 as a widget that does not exist", async () => {
      const foreign = await http.get(`/api/widgets/${aWidget}`).set(auth(b.token));
      const missing = await http.get(`/api/widgets/${MISSING_ID}`).set(auth(b.token));
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(NOT_FOUND);
      expect(missing.body).toEqual(foreign.body);
    });

    it("B cannot change or delete A's widget, and A's widget is unchanged afterwards", async () => {
      const patch = await http.patch(`/api/widgets/${aWidget}`).set(auth(b.token)).send({ title: "Hacked" });
      const del = await http.delete(`/api/widgets/${aWidget}`).set(auth(b.token));
      expect(patch.status).toBe(404);
      expect(del.status).toBe(404);

      const stillThere = await http.get(`/api/widgets/${aWidget}`).set(auth(a.token));
      expect(stillThere.status).toBe(200);
      expect(stillThere.body.title).not.toBe("Hacked");
    });

    it("owner_id cannot be smuggled in the body", async () => {
      const res = await http
        .post("/api/widgets")
        .set(auth(b.token))
        .send({ ...(await http.get(`/api/widgets/${bWidget}`).set(auth(b.token))).body, ownerId: a.userId });
      expect(res.status).toBe(422); // unknown keys are rejected, so ownerId is never read
    });
  });

  describe("submissions", () => {
    it("Probe 1: A's submission appears in A's list, linked to A's widget", async () => {
      const res = await http.get("/api/submissions").set(auth(a.token));
      expect(res.status).toBe(200);
      const ids = res.body.items.map((s) => s.id);
      expect(ids).toContain(aSubmissionId);
      expect(res.body.items.every((s) => s.widgetId === aWidget)).toBe(true);
    });

    it("B's list contains only B's submissions", async () => {
      const res = await http.get("/api/submissions").set(auth(b.token));
      expect(res.body.items.map((s) => s.id)).not.toContain(aSubmissionId);
      expect(res.body.items.every((s) => s.widgetId === bWidget)).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain("lead-of-a");
    });

    it("B filtering by A's widget gets 404, not an empty list", async () => {
      const res = await http.get(`/api/submissions?widgetId=${aWidget}`).set(auth(b.token));
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it("B's stats count none of A's submissions", async () => {
      const res = await http.get("/api/stats/overview").set(auth(b.token));
      expect(res.body.totals.total).toBe(1);
      expect(res.body.perWidget.map((w) => w.widgetId)).toEqual([bWidget]);
    });

    it("the owner API never returns the visitor IP or internal ids", async () => {
      const res = await http.get("/api/submissions").set(auth(a.token));
      for (const item of res.body.items) {
        expect(Object.keys(item).sort()).toEqual(["createdAt", "data", "geo", "id", "widgetId"]);
      }
    });
  });
});
