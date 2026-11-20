import { rateLimit } from "express-rate-limit";
import { TooManyRequestsError } from "../../errors.js";
import { publicIdSchema } from "../schemas/widgets.js";

// In-memory store: counts reset on restart and are not shared between processes. Acceptable
// for one instance; the real fix is a shared store (Postgres or Redis). See README limitations.

// Production limits. Tests pass smaller ones (e.g. 3 per 1.5 s) so a burst and its recovery take
// seconds instead of a minute.
export const DEFAULT_RATE_LIMITS = Object.freeze({ windowMs: 60 * 1000, perIp: 10, perWidget: 100 });

// Per widget key. req.body is parsed but not validated. Only a string in the public id format gets
// its own quota; everything else shares ONE bucket. Otherwise a new made-up id per request would
// get a fresh quota and add a key (up to 10kb) to the in-memory store each time. Requests in that
// bucket would get a 404 anyway, so they never use up a real widget's quota.
// "unknown widget" cannot collide with a real id: a public id never contains a space.
// Limitation: a random id in the right format still gets its own key and reaches a DB lookup;
// only the per-IP limiter caps that.
function perWidgetKey(req) {
  if (!req.body || !publicIdSchema.safeParse(req.body.widgetId).success) {
    return "unknown widget";
  }
  return req.body.widgetId;
}

// Called once per app (createApp), so every app has its own counters: nothing leaks between tests.
export function createRateLimiters({ windowMs, perIp, perWidget } = DEFAULT_RATE_LIMITS) {
  // Shared by both limiters. By the time `handler` runs, the library has already set Retry-After,
  // so we only hand an AppError to the central error handler, which renders the usual envelope.
  // The CORS middleware ran earlier, so the 429 still carries Access-Control-Allow-Origin.
  const common = {
    windowMs,
    standardHeaders: "draft-8", // RateLimit + RateLimit-Policy headers (IETF draft)
    legacyHeaders: false, // no X-RateLimit-* duplicates
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  };

  return {
    // Per IP: one machine cannot flood us across every widget. Runs BEFORE the body is parsed, so
    // it uses the default key: req.ip (decided by `trust proxy` in app.js), with IPv6 addresses
    // grouped by /56 so one user cannot rotate through their own block of addresses.
    perIpLimiter: rateLimit({ ...common, limit: perIp }),
    // Per widget: a total cap on one widget, however many IPs send. Runs AFTER express.json()
    // (the id is in the body) but BEFORE any database work.
    perWidgetLimiter: rateLimit({ ...common, limit: perWidget, keyGenerator: perWidgetKey }),
  };
}
