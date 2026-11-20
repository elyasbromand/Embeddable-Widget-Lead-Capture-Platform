import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { parse } from "../validate.js";
import { listSubmissionsQuerySchema, statsQuerySchema } from "../schemas/dashboard.js";
import * as dashboardService from "../../services/dashboardService.js";

// Owner dashboard: read-only, GET only, so no body parser. Mounted at /api.
// No CORS headers: like the rest of /api, foreign origins are not allowed to read it.
export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

// req.user.id comes from the verified token; the query string can only narrow WITHIN that owner.
dashboardRouter.get("/submissions", async (req, res) => {
  const query = parse(listSubmissionsQuerySchema, req.query);
  res.json(await dashboardService.listSubmissions(req.user.id, query));
});

dashboardRouter.get("/stats/overview", async (req, res) => {
  const query = parse(statsQuerySchema, req.query);
  res.json(await dashboardService.overview(req.user.id, query));
});
