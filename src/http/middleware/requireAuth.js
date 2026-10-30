import { UnauthorizedError } from "../../errors.js";
import * as authService from "../../services/authService.js";

// Authentication only: it answers "who is calling?" and puts the answer on req.user.
// Whether a row belongs to that user is decided in each repository query, not here.
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedError(); // Express forwards a synchronous throw to the error handler
  }
  req.user = authService.verifyToken(token);
  next();
}
