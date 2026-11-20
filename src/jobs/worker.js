import { config } from "../config/index.js";
import { logger } from "../logger.js";
import { pool } from "../repositories/db.js";
import { findSubmissionForEmail } from "../repositories/submissionsRepository.js";
import { createMailer } from "../integrations/mailer.js";
import { createEmailService } from "../services/emailService.js";
import { createBoss } from "./boss.js";
import { ensureQueues } from "./queues.js";
import { registerEmailWorkers } from "./handlers.js";

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

await registerEmailWorkers(boss, { emailService, logger });

logger.info({ forceEmailFailure: config.FORCE_EMAIL_FAILURE }, "Worker started");

async function shutdown(signal) {
  logger.info({ signal }, "Worker shutting down");
  await boss.stop({ graceful: true, wait: true });
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
