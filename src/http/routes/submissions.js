import express, { Router } from "express";
import { requireJson } from "../middleware/requireJson.js";
import { parse } from "../validate.js";
import { submissionBodySchema } from "../schemas/submissions.js";
import * as submissionsService from "../../services/submissionsService.js";

// Public: visitors post here from customers' pages (another origin). No auth.
// Mounted at /submissions in app.js, so middleware here never runs for the owner API.
export const submissionsRouter = Router();

submissionsRouter.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
  res.set("Access-Control-Max-Age", "7200"); // the preflight can be cached for 2 hrs, so the browser doesn't repeat it for every submission.

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

submissionsRouter.use(requireJson);
submissionsRouter.use(express.json({ limit: "10kb" }));

// The visitor IP is req.ip: the server's view of the connection, never a body field.
submissionsRouter.post("/", async (req, res) => {
  const data = parse(submissionBodySchema, req.body);
  const submission = await submissionsService.createSubmission({
    widgetId: data.widgetId,
    fields: data.fields,
    ip: req.ip,
  });
  res.status(201).json(submission);
});
