import express from "express";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

// Builds the app without listening, so tests (Step 11) can import it with supertest.
export function createApp() {
  const app = express();
  app.disable("x-powered-by"); // don't advertise the framework

  app.use(healthRouter);
  app.use("/auth", authRouter);

  // Order matters: these two go last, after every route.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
