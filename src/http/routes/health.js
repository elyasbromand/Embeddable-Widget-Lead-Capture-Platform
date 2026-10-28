import { Router } from "express";
import * as healthService from "../../services/healthService.js";

export const healthRouter = Router();

// Express 5 forwards a rejected promise to the error handler, so no try/catch here.
healthRouter.get("/health", async (req, res) => {
  res.json(await healthService.check());
});
