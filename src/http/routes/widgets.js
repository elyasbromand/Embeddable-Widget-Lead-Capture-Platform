import express, { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { parse } from "../validate.js";
import { createWidgetSchema, updateWidgetSchema } from "../schemas/widgets.js";
import * as widgetsService from "../../services/widgetsService.js";

export const widgetsRouter = Router();

// Auth runs first, so an unauthenticated request is a 401 before any body parsing or DB work.
widgetsRouter.use(requireAuth);
// 10 fields with short strings fit easily; anything bigger is a 413.
widgetsRouter.use(express.json({ limit: "10kb" }));

// req.user.id comes from the verified token, never from the body or the URL.
widgetsRouter.post("/", async (req, res) => {
  const data = parse(createWidgetSchema, req.body);
  res.status(201).json(await widgetsService.create(req.user.id, data));
});

widgetsRouter.get("/", async (req, res) => {
  res.json(await widgetsService.list(req.user.id));
});

widgetsRouter.get("/:id", async (req, res) => {
  res.json(await widgetsService.get(req.user.id, req.params.id));
});

widgetsRouter.patch("/:id", async (req, res) => {
  const patch = parse(updateWidgetSchema, req.body);
  res.json(await widgetsService.update(req.user.id, req.params.id, patch));
});

widgetsRouter.delete("/:id", async (req, res) => {
  await widgetsService.remove(req.user.id, req.params.id);
  res.status(204).end();
});
