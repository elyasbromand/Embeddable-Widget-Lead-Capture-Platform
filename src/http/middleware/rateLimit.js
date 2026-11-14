import { rateLimit } from "express-rate-limit";
import { TooManyRequestsError } from "../../errors.js";
import { publicIdSchema } from "../schemas/widgets.js";

// In-memory store: counts reset on restart and are not shared between processes. Acceptable
// for one instance; the real fix is a shared store (Postgres or Redis). See README limitations.

const WINDOW_MS = 60 * 1000; // 1 minute

// Shared by both limiters. By the time `handler` runs, the library has already set Retry-After,
// so we only hand an AppError to the central error handler, which renders the usual envelope.
// The CORS middleware ran earlier, so the 429 still carries Access-Control-Allow-Origin.
const common = {
  windowMs: WINDOW_MS,
  standardHeaders: "draft-8", // RateLimit + RateLimit-Policy headers (IETF draft)
  legacyHeaders: false, // no X-RateLimit-* duplicates
  handler: (_req, _res, next) => next(new TooManyRequestsError()),
};

// Per IP: one machine cannot flood us across every widget. Runs BEFORE the body is parsed, so
// it uses the default key: req.ip (decided by `trust proxy` in app.js), with IPv6 addresses
// grouped by /56 so one user cannot rotate through their own block of addresses.
export const perIpLimiter = rateLimit({
  ...common,
  limit: 10,
});

// Per widget: a total cap on one widget, however many IPs send. Runs AFTER express.json()
// (the id is in the body) but BEFORE any database work.
export const perWidgetLimiter = rateLimit({
  ...common,
  limit: 100,
  // req.body is parsed but not validated. Only a string in the public id format gets its own
  // quota; everything else shares ONE bucket. Otherwise a new made-up id per request would get a
  // fresh 100/min and add a key (up to 10kb) to the in-memory store each time. Requests in that
  // bucket would get a 404 anyway, so they never use up a real widget's quota.
  // "unknown widget" cannot collide with a real id: a public id never contains a space.
  // Limitation: a random id in the right format still gets its own key and reaches a DB
  // lookup; only the per-IP limiter caps that.
  keyGenerator: (req) => {
    if (!req.body || !publicIdSchema.safeParse(req.body.widgetId).success) {
      return "unknown widget";
    }
    return req.body.widgetId;
  },
});
