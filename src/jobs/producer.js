import { createBoss } from "./boss.js";
import { ensureQueues } from "./queues.js";
import { logger } from "../logger.js";

// The API's pg-boss instance: it only sends jobs. The worker process consumes them.
export const boss = createBoss({ role: "api" });

// If pg-boss cannot start, the API still serves: submissions are stored, and each failed
// enqueue is logged by the caller. Email is a side effect, never a reason to refuse leads.
export async function startProducer() {
  try {
    await boss.start();
    await ensureQueues(boss);
    logger.info("Job producer ready");
  } catch (err) {
    logger.error({ err }, "Job producer failed to start; emails will not be queued");
  }
}

export async function stopProducer() {
  await boss.stop({ graceful: true, wait: true });
}
