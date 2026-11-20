import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { makeTestApp, createOwner, createWidget, submit, createFakeLogger } from "../helpers/app.js";
import { pool, resetDb, findSubmission } from "../helpers/db.js";
import { createBoss } from "../../src/jobs/boss.js";
import { ensureQueues, CONFIRMATION_EMAIL, CONFIRMATION_EMAIL_OPTIONS } from "../../src/jobs/queues.js";
import { registerEmailWorkers } from "../../src/jobs/handlers.js";
import { createEmailService } from "../../src/services/emailService.js";

// Probe 5: a failing email does not block the submission (EVIDENCE row 14, S3).
afterAll(() => pool.end());

describe("Probe 5: email failure never reaches the visitor", () => {
  it("when the queue itself is down, the visitor still gets 201, the row is stored, and the error is logged", async () => {
    await resetDb();
    const t = makeTestApp({ enqueueFails: true });
    const owner = await createOwner(t.http);
    const widgetId = await createWidget(t.http, owner.token);

    const res = await submit(t.http, widgetId);

    expect(res.status).toBe(201);
    expect(await findSubmission(res.body.id)).not.toBeNull();
    const logged = t.logger.entries.find((e) => e.msg === "Could not enqueue confirmation email");
    expect(logged.level).toBe("error");
    expect(logged.obj.submissionId).toBe(res.body.id);
  });

  it("on success the job carries only the submission id (no personal data)", async () => {
    const t = makeTestApp();
    const owner = await createOwner(t.http);
    const widgetId = await createWidget(t.http, owner.token);
    const res = await submit(t.http, widgetId);
    expect(t.enqueued).toEqual([res.body.id]);
  });
});

describe("emailService", () => {
  const submission = {
    id: "s1",
    data: { email: "visitor@example.com", first_name: "Ada" },
    widgetTitle: "Newsletter",
    widgetFields: [{ name: "email", type: "email" }],
  };

  it("sends a plain-text email to the widget's email field", async () => {
    const sent = [];
    const service = createEmailService({
      findSubmissionForEmail: async () => submission,
      mailer: { send: async (msg) => (sent.push(msg), { messageId: "m1" }) },
    });
    await expect(service.sendConfirmation("s1")).resolves.toEqual({ status: "sent", messageId: "m1" });
    expect(sent[0].to).toBe("visitor@example.com");
    expect(sent[0].text).not.toContain("s1"); // no internal id in the email
  });

  it("throws when the mailer fails, which is what makes pg-boss retry", async () => {
    const service = createEmailService({
      findSubmissionForEmail: async () => submission,
      mailer: { send: async () => { throw new Error("SMTP down"); } },
    });
    await expect(service.sendConfirmation("s1")).rejects.toThrow("SMTP down");
  });

  it("skips (no retry) when the submission is gone", async () => {
    const service = createEmailService({ findSubmissionForEmail: async () => null, mailer: {} });
    await expect(service.sendConfirmation("x")).resolves.toMatchObject({ status: "skipped" });
  });
});

// Real pg-boss on the test database, with the REAL retry limit and dead letter queue. Only the
// delay is shortened (backoff capped at 1 s instead of 2-16 s) and polling is 0.5 s, so the four
// attempts take seconds. The policy under test (how many retries, where the job ends) is unchanged.
describe("Probe 5: retries, then dead letter and ALERT (real pg-boss)", () => {
  let boss;
  const logger = createFakeLogger();
  let attempts = 0;

  beforeAll(async () => {
    boss = createBoss({ role: "worker" });
    boss.on("error", () => {}); // createBoss logs errors; the test logger is enough here
    await boss.start();
    await ensureQueues(boss, { retryDelay: 1, retryDelayMax: 1 }); // backoff stays on, capped at 1 s
    const failingEmailService = {
      async sendConfirmation() {
        attempts += 1;
        throw new Error("SMTP down (test)");
      },
    };
    await registerEmailWorkers(boss, {
      emailService: failingEmailService,
      logger,
      workOptions: { pollingIntervalSeconds: 0.5 },
    });
  });

  afterAll(async () => {
    await boss?.stop({ graceful: false, wait: true });
  });

  it(`tries ${CONFIRMATION_EMAIL_OPTIONS.retryLimit + 1} times, marks the job failed, and raises one ALERT`, async () => {
    const submissionId = randomUUID();
    const jobId = await boss.send(CONFIRMATION_EMAIL, { submissionId }, { id: submissionId });
    expect(jobId).toBe(submissionId);

    // Wait for the ALERT (the dead-letter handler), at most 25 s.
    const deadline = Date.now() + 25_000;
    const alertFor = () => logger.entries.find((e) => e.obj?.alert && e.obj.submissionId === submissionId);
    while (!alertFor() && Date.now() < deadline) await sleep(250);

    expect(alertFor()).toBeDefined();
    expect(alertFor().level).toBe("error");
    expect(attempts).toBe(CONFIRMATION_EMAIL_OPTIONS.retryLimit + 1); // 1 try + 3 retries

    const attemptLogs = logger.entries.filter((e) => e.level === "warn" && e.obj.submissionId === submissionId);
    expect(attemptLogs.map((e) => e.obj.attempt)).toEqual([1, 2, 3, 4]);

    const job = await boss.getJobById(CONFIRMATION_EMAIL, jobId);
    expect(job.state).toBe("failed");

    // Sending the same submission again does not create a second job (dedupe by id).
    expect(await boss.send(CONFIRMATION_EMAIL, { submissionId }, { id: submissionId })).toBeNull();
  });
});
