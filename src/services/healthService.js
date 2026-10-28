import { ServiceUnavailableError } from "../errors.js";
import { logger } from "../logger.js";
import * as healthRepository from "../repositories/healthRepository.js";

export async function check() {
  try {
    await healthRepository.ping();
  } catch (err) {
    // The client only learns "database unavailable"; the reason goes to the log.
    logger.warn({ err }, "Health check: database unreachable");
    throw new ServiceUnavailableError("Database unavailable");
  }
  return { status: "ok", db: "ok" };
}
