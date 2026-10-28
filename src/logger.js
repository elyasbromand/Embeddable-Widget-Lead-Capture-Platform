import pino from "pino";
import { config } from "./config/index.js";

// One logger for the whole process. JSON lines on stdout; the environment decides where they go.
export const logger = pino({
  level: config.LOG_LEVEL,
  // Safety net: if a request, header set or body is ever logged, these values are replaced.
  // Paths are exact; `*` matches one level only, so list each place a secret can appear.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "password",
      "*.password",
      "token",
      "*.token",
      // pg errors carry the whole client object: connection params and the cancel `secretKey`.
      "err.client",
    ],
    censor: "[REDACTED]",
  },
});
