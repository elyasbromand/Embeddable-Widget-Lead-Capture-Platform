import { CONFIRMATION_EMAIL, CONFIRMATION_EMAIL_DLQ } from "./queues.js";

// The worker's job handlers, separate from worker.js (which starts the process) so a test can
// register them on a pg-boss instance with a failing email service and watch the retries happen.
// workOptions: pg-boss polling options; tests poll faster than the default 2 s.
export async function registerEmailWorkers(boss, { emailService, logger, workOptions = {} }) {
  // pg-boss hands the handler an array of jobs (one by default). Returning completes the job;
  // throwing fails this attempt, and pg-boss retries it with backoff until retryLimit is used up.
  await boss.work(CONFIRMATION_EMAIL, workOptions, async ([job]) => {
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
  await boss.work(CONFIRMATION_EMAIL_DLQ, workOptions, async ([job]) => {
    logger.error(
      { alert: true, jobId: job.id, submissionId: job.data.submissionId },
      `ALERT confirmation email gave up after all retries (submission ${job.data.submissionId})`
    );
  });
}
