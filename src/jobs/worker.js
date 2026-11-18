import { config } from "../config/index.js";
import { logger } from "../logger.js";
import { pool } from "../repositories/db.js";
import { findSubmissionForEmail } from "../repositories/submissionsRepository.js";
import { createMailer } from "../integrations/mailer.js";
import { createEmailService } from "../services/emailService.js";
import { createBoss } from "./boss.js";
import { CONFIRMATION_EMAIL, CONFIRMATION_EMAIL_DLQ, ensureQueues } from "./queues.js";

// Separate process (`npm run worker`): a slow or broken mail server never touches the API.
const mailer = createMailer({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  from: config.MAIL_FROM,
  forceFailure: config.FORCE_EMAIL_FAILURE,
});
const emailService = createEmailService({ findSubmissionForEmail, mailer });

const boss = createBoss({ role: "worker" });
await boss.start();
await ensureQueues(boss);

// pg-boss hands the handler an array of jobs (one by default). Returning completes the job;
// throwing fails this attempt, and pg-boss retries it with backoff until retryLimit is used up.
await boss.work(CONFIRMATION_EMAIL, async ([job]) => {
  const { submissionId } = job.data;
  const attempt = job.retryCount + 1;
  try {
    const result = await emailService.sendConfirmation(submissionId);
    logger.info({ jobId: job.id, submissionId, attempt, ...result }, "Confirmation email job done");
  } catch (err) {
    logger.warn({ jobId: job.id, submissionId, attempt, error: err.message }, "Confirmation email failed; will retry");
    throw err;
  }
});

// After the last retry fails, pg-boss copies the job here. No more retries: a human has to look.
await boss.work(CONFIRMATION_EMAIL_DLQ, async ([job]) => {
  logger.error(
    { alert: true, jobId: job.id, submissionId: job.data.submissionId },
    `ALERT confirmation email gave up after all retries (submission ${job.data.submissionId})`
  );
});

logger.info({ forceEmailFailure: config.FORCE_EMAIL_FAILURE }, "Worker started");

async function shutdown(signal) {
  logger.info({ signal }, "Worker shutting down");
  await boss.stop({ graceful: true, wait: true });
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
