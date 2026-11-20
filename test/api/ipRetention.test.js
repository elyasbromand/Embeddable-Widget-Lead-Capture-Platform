import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeTestApp, createOwner, createWidget, submit } from "../helpers/app.js";
import { pool, resetDb, findSubmission } from "../helpers/db.js";
import { clearExpiredIps } from "../../src/repositories/submissionsRepository.js";
import { registerRetentionWorker } from "../../src/jobs/handlers.js";
import { IP_RETENTION, IP_RETENTION_CRON } from "../../src/jobs/queues.js";

// Raw IPs are personal data, kept 90 days (DESIGN.md §7.2, README limitations).
describe("raw IP retention", () => {
  let oldId, newId;

  beforeAll(async () => {
    await resetDb();
    const { http } = makeTestApp();
    const owner = await createOwner(http);
    const widgetId = await createWidget(http, owner.token);
    oldId = (await submit(http, widgetId, { email: "old@example.com" })).body.id;
    newId = (await submit(http, widgetId, { email: "new@example.com" })).body.id;
    await pool.query("UPDATE submissions SET created_at = now() - interval '91 days' WHERE id = $1", [oldId]);
  });
  afterAll(() => pool.end());

  it("clears the IP of rows older than the retention period and keeps everything else", async () => {
    expect(await clearExpiredIps(90)).toBe(1);

    const old = await findSubmission(oldId);
    expect(old.ip).toBeNull();
    expect(old.data).toEqual({ email: "old@example.com" }); // the lead itself stays
    expect(old.geo).not.toBeNull();

    expect((await findSubmission(newId)).ip).not.toBeNull(); // recent rows untouched
    expect(await clearExpiredIps(90)).toBe(0); // running again changes nothing
  });

  it("the worker registers a daily schedule and logs only a count", async () => {
    const calls = { work: null, schedule: null };
    const fakeBoss = {
      async work(name, handler) { calls.work = { name, handler }; },
      async schedule(name, cron) { calls.schedule = { name, cron }; },
    };
    const entries = [];
    const logger = { info: (obj, msg) => entries.push({ obj, msg }) };
    await registerRetentionWorker(fakeBoss, { clearExpiredIps: async () => 3, logger });

    expect(calls.schedule).toEqual({ name: IP_RETENTION, cron: IP_RETENTION_CRON });
    await calls.work.handler([]);
    expect(entries[0].obj).toEqual({ cleared: 3, days: 90 });
  });
});
