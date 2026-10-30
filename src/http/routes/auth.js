import express, { Router } from "express";
import { parse } from "../validate.js";
import { loginSchema, registerSchema } from "../schemas/auth.js";
import * as authService from "../../services/authService.js";

export const authRouter = Router();

// Credentials are tiny; a small limit means a huge body is a 413, not work for the server.
authRouter.use(express.json({ limit: "10kb" }));

authRouter.post("/register", async (req, res) => {
  const { email, password } = parse(registerSchema, req.body);
  res.status(201).json(await authService.register(email, password));
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  res.json(await authService.login(email, password));
});
