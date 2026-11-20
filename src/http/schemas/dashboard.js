import * as z from "zod";
import { publicIdSchema } from "./widgets.js";

// Query strings are ALWAYS strings ("20", not 20), and a missing key is undefined.
// z.coerce.number() turns "20" into 20; "abc" becomes NaN and fails as "expected number".
// strictObject: an unknown or misspelled key (?limt=5) is a 422, not silently ignored.
// A repeated key (?limit=1&limit=2) arrives as an array and fails too.

export const listSubmissionsQuerySchema = z.strictObject({
  widgetId: publicIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(200).optional(),
});

export const statsQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
