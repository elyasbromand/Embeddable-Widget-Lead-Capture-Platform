import { Router } from "express";
import { NotFoundError } from "../../errors.js";
import { checkWidgetId } from "../middleware/widgetId.js";
import * as widgetsService from "../../services/widgetsService.js";

// Public widget config, fetched by the bundle from customers' pages (another origin). No auth.
// Mounted at /widgets in app.js, so middleware here never runs for the owner API.
export const publicWidgetsRouter = Router();

// Before the route, so the 404 carries it too. No credentials: the config is the same for everyone.
publicWidgetsRouter.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});
publicWidgetsRouter.param("id", checkWidgetId);

// Express adds a weak ETag to res.json() and answers 304 when If-None-Match matches,
// so a re-check after 60 s costs headers only when the owner changed nothing.
publicWidgetsRouter.get("/:id/config", async (req, res) => {
  let widgetConfig;
  try {
    widgetConfig = await widgetsService.getPublicConfig(req.params.id);
  } catch (err) {
    // Only a 404 is cached (briefly): repeat hits for a dead id skip the DB. A 500 is never
    // cached, so it ends the moment the outage does.
    if (err instanceof NotFoundError) res.set("Cache-Control", "public, max-age=10");
    throw err;
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json(widgetConfig);
});
