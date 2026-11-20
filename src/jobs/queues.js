// Queue names and their retry policy, shared by the API (producer) and the worker (consumer).
export const CONFIRMATION_EMAIL = "confirmation-email";
export const CONFIRMATION_EMAIL_DLQ = "confirmation-email-dlq";
// Daily job that clears raw IPs older than IP_RETENTION_DAYS (DESIGN.md §7.2).
export const IP_RETENTION = "ip-retention";
export const IP_RETENTION_DAYS = 90;
export const IP_RETENTION_CRON = "0 3 * * *"; // every day at 03:00 UTC

// Retry policy lives on the queue, so every job sent to it gets the same rules.
// 3 retries with exponential backoff AND jitter: retryBackoff makes pg-boss wait
// retryDelay * (2^n/2 + 2^n/2 * random()), so 2-4 s, 4-8 s, 8-16 s (capped at 60 s).
// The random half spreads jobs that failed together, so they don't all hit a recovering
// mail server at the same moment. After the last retry the job goes to the dead-letter queue.
export const CONFIRMATION_EMAIL_OPTIONS = {
  retryLimit: 3,
  retryDelay: 2,
  retryBackoff: true,
  retryDelayMax: 60,
  deadLetter: CONFIRMATION_EMAIL_DLQ,
};

// createQueue is safe to call on every start: an existing queue is left as it is.
// The dead-letter queue must exist before a queue can point at it.
// overrides: tests shorten the delay (same retryLimit and dead letter) so 4 attempts take seconds.
export async function ensureQueues(boss, overrides = {}) {
  await boss.createQueue(CONFIRMATION_EMAIL_DLQ);
  await boss.createQueue(CONFIRMATION_EMAIL, { ...CONFIRMATION_EMAIL_OPTIONS, ...overrides });
  // Default retry policy is enough: if a run fails, tomorrow's run clears the same rows.
  await boss.createQueue(IP_RETENTION);
}
