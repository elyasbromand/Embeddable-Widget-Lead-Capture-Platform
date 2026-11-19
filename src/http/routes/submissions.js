import express, { Router } from "express";
import { requireJson } from "../middleware/requireJson.js";
import { perIpLimiter, perWidgetLimiter } from "../middleware/rateLimit.js";
import { parse } from "../validate.js";
import { submissionBodySchema, idempotencyHeaderSchema } from "../schemas/submissions.js";
import * as submissionsService from "../../services/submissionsService.js";

// Public: visitors post here from customers' pages (another origin). No auth.
// Mounted at /submissions in app.js, so middleware here never runs for the owner API.
export const submissionsRouter = Router();

submissionsRouter.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  res.set("Access-Control-Expose-Headers", "Retry-After");
  res.set("Access-Control-Max-Age", "7200"); // the preflight can be cached for 2 hrs, so the browser doesn't repeat it for every submission.

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

// Order is the defence. Each step rejects cheaply before the next, more expensive one runs:
// per-IP limit (no parsing) -> 415 -> parse at most 10kb -> per-widget limit -> validate -> DB.
// Preflights ended above, so they never count against a limit.
submissionsRouter.use(perIpLimiter);
submissionsRouter.use(requireJson);
submissionsRouter.use(express.json({ limit: "10kb" }));
submissionsRouter.use(perWidgetLimiter);

// The visitor IP is req.ip: the server's view of the connection, never a body field.
// The idempotency key is a header, not a body field: it describes the request (a retry of the
// same submit), not the lead. req.get() is case-insensitive and returns undefined when absent.
submissionsRouter.post("/", async (req, res) => {
  const headers = parse(idempotencyHeaderSchema, {
    "Idempotency-Key": req.get("Idempotency-Key"),
  });
  const data = parse(submissionBodySchema, req.body);
  const submission = await submissionsService.createSubmission({
    widgetId: data.widgetId,
    fields: data.fields,
    ip: req.ip,
    website: data.website,
    idempotencyKey: headers["Idempotency-Key"],
  });
  res.status(201).json(submission);
});
