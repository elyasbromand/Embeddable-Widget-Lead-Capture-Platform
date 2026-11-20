import express from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { widgetsRouter } from "./routes/widgets.js";
import { deliveryRouter } from "./routes/delivery.js";
import { publicWidgetsRouter } from "./routes/publicWidgets.js";
import { submissionsRouter } from "./routes/submissions.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Builds the app without listening, so tests (Step 11) can import it with supertest.
export function createApp() {
  const app = express();
  app.disable("x-powered-by"); // don't advertise the framework
  // No proxy in front of us yet, so X-Forwarded-For is ignored and req.ip is the socket address.
  // A client could fake that header; change this only when a real proxy is deployed.
  app.set("trust proxy", false);

  app.use(healthRouter);
  app.use(deliveryRouter);
  app.use("/widgets", publicWidgetsRouter); // public config; the owner API is /api/widgets
  app.use("/submissions", submissionsRouter);
  app.use("/auth", authRouter);
  app.use("/api/widgets", widgetsRouter);
  app.use("/api", dashboardRouter); // /api/submissions, /api/stats/overview

  // Order matters: these two go last, after every route.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
