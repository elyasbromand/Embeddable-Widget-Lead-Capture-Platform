import * as z from "zod";
import { publicIdSchema } from "./widgets.js";

// The envelope of POST /submissions, the same for every widget:
//   { widgetId, fields, idempotencyKey?, website? }
// `fields` is only checked to be an object here. Its contents depend on the widget, so they
// are checked by buildFieldsSchema once the widget row is loaded. idempotencyKey and website are
// used in Step 6, but a strict object must already allow them.
export const submissionBodySchema = z.strictObject({
  widgetId: z.string(),
  fields: z.record(z.any()),
  idempotencyKey: z.string().max(100).optional(),
  website: z.string().max(200).optional(),
});

// Longest value we accept per field type. 254 is the longest valid email address.
const MAX_LENGTH = { text: 200, email: 254, textarea: 2000 };

// Valid JSON that Postgres jsonb refuses: a NUL character or half of a surrogate pair. Without
// this check, those values would pass validation and turn into a 500 at the INSERT.
const isStorable = (value) => value.isWellFormed() && !value.includes("\u0000");

// The validator for one field, based on its type.
function fieldValidator({ type, required }) {
  const text = z
    .string()
    .trim()
    .min(required ? 1 : 0)
    .max(MAX_LENGTH[type])
    .refine(isStorable, "Contains invalid characters");
  if (type !== "email") return text;
  // pipe: trim first, then check the format. A form sends "" for an optional email left blank.
  return text.pipe(required ? z.email() : z.email().or(z.literal("")));
}

// Builds a zod schema from a widget's own field definitions, at request time, because every
// widget has different fields. widgetFields comes from the database, never from the request:
//   [{ name: "email", label: "Email", type: "email", required: true }]
// strictObject rejects any key the owner did not define.
export function buildFieldsSchema(widgetFields) {
  const shape = {};
  for (const field of widgetFields) {
    const validator = fieldValidator(field);
    shape[field.name] = field.required ? validator : validator.optional();
  }
  return z.strictObject(shape);
}
