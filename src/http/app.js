import express from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { widgetsRouter } from "./routes/widgets.js";
import { deliveryRouter } from "./routes/delivery.js";
import { publicWidgetsRouter } from "./routes/publicWidgets.js";
import { createSubmissionsRouter } from "./routes/submissions.js";
import { DEFAULT_RATE_LIMITS } from "./middleware/rateLimit.js";
import { submissionsService as defaultSubmissionsService } from "../services/submissionsService.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Builds the app without listening, so tests can call it with supertest.
// Tests pass their own submissionsService (mock geo, fake email queue) and small rate limits;
// the server passes nothing and gets the real ones.
export function createApp({
  submissionsService = defaultSubmissionsService,
  rateLimits = DEFAULT_RATE_LIMITS,
} = {}) {
  const app = express();
  app.disable("x-powered-by"); // don't advertise the framework
  // No proxy in front of us yet, so X-Forwarded-For is ignored and req.ip is the socket address.
  // A client could fake that header; change this only when a real proxy is deployed.
  app.set("trust proxy", false);

  app.use(healthRouter);
  app.use(deliveryRouter);
  app.use("/widgets", publicWidgetsRouter); // public config; the owner API is /api/widgets
  app.use("/submissions", createSubmissionsRouter({ submissionsService, rateLimits }));
  app.use("/auth", authRouter);
  app.use("/api/widgets", widgetsRouter);
  app.use("/api", dashboardRouter); // /api/submissions, /api/stats/overview

  // Order matters: these two go last, after every route.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
