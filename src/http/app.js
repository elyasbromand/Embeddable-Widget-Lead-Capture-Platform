import express from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { widgetsRouter } from "./routes/widgets.js";
import { deliveryRouter } from "./routes/delivery.js";
import { publicWidgetsRouter } from "./routes/publicWidgets.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Builds the app without listening, so tests (Step 11) can import it with supertest.
export function createApp() {
  const app = express();
  app.disable("x-powered-by"); // don't advertise the framework

  app.use(healthRouter);
  app.use(deliveryRouter);
  app.use("/widgets", publicWidgetsRouter); // public config; the owner API is /api/widgets
  app.use("/auth", authRouter);
  app.use("/api/widgets", widgetsRouter);

  // Order matters: these two go last, after every route.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
