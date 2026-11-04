import { NotFoundError } from "../../errors.js";
import { publicIdSchema } from "../schemas/widgets.js";

// For router.param("id", ...): runs before any route with :id. An id we could never have issued
// (wrong length, NUL byte, emoji) is answered here without a DB query. 404, not 422, and the same
// message as a missing widget: from outside, "malformed" and "does not exist" look identical.
export function checkWidgetId(_req, _res, next, id) {
  next(publicIdSchema.safeParse(id).success ? undefined : new NotFoundError("Widget not found"));
}
