import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { makeTestApp, createOwner, createWidget, submit } from "../helpers/app.js";
import { pool, resetDb, countSubmissions, findSubmission } from "../helpers/db.js";

// Probe 6: one spam control blocks a spammer (EVIDENCE row 11), plus idempotency (S5).
// The pool is closed once, after BOTH describe blocks (a per-block afterAll would close it early).
afterAll(() => pool.end());

describe("Probe 6: honeypot", () => {
  const t = makeTestApp();
  let widgetId;

  beforeAll(async () => {
    await resetDb();
    const owner = await createOwner(t.http);
    widgetId = await createWidget(t.http, owner.token);
  });

  it("a filled honeypot gets the same 201 shape as a real submission, but nothing is stored or emailed", async () => {
    const before = await countSubmissions();
    const enqueuedBefore = t.enqueued.length;
    const callsBefore = t.providers.a.calls;

    const res = await submit(t.http, widgetId, { email: "bot@example.com" }, { website: "http://spam.example" });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(["createdAt", "id"]);
    expect(await countSubmissions()).toBe(before);
    expect(await findSubmission(res.body.id)).toBeNull();
    expect(t.enqueued.length).toBe(enqueuedBefore); // no email
    expect(t.providers.a.calls).toBe(callsBefore); // bots don't spend geo quota
    // logged without the attacker's value
    const hit = t.logger.entries.find((e) => e.obj?.event === "honeypot_hit");
    expect(hit).toBeDefined();
    expect(JSON.stringify(hit)).not.toContain("spam.example");
  });

  it("an empty honeypot (what the real widget sends) is stored normally", async () => {
    const res = await submit(t.http, widgetId, { email: "human@example.com" }, { website: "" });
    expect(res.status).toBe(201);
    expect(await findSubmission(res.body.id)).not.toBeNull();
  });

  it("a bot still gets 422 for invalid fields, so the trap is not revealed by a different answer", async () => {
    const res = await submit(t.http, widgetId, { email: "nope" }, { website: "http://spam.example" });
    expect(res.status).toBe(422);
  });
});

describe("Idempotency-Key (S5)", () => {
  const t = makeTestApp();
  let widgetId;

  beforeAll(async () => {
    const owner = await createOwner(t.http);
    widgetId = await createWidget(t.http, owner.token);
  });

  it("a retry with the same key returns the original row: one row, one email", async () => {
    const key = randomUUID();
    const before = await countSubmissions();

    const first = await submit(t.http, widgetId, { email: "retry@example.com" }, { idempotencyKey: key });
    const second = await submit(t.http, widgetId, { email: "retry@example.com" }, { idempotencyKey: key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await countSubmissions()).toBe(before + 1);
    // The fake queue sees the id twice; the real queue dedupes on { id: submissionId } (pg-boss, Step 8).
    expect(new Set(t.enqueued).has(first.body.id)).toBe(true);
  });

  it("parallel requests with the same key (a double click) still store one row", async () => {
    const key = randomUUID();
    const before = await countSubmissions();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => submit(t.http, widgetId, { email: "double@example.com" }, { idempotencyKey: key }))
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await countSubmissions()).toBe(before + 1);
  });

  it("a key that is not a UUID is a 422", async () => {
    const res = await submit(t.http, widgetId, { email: "x@example.com" }, { idempotencyKey: "abc" });
    expect(res.status).toBe(422);
  });
});
