import * as z from "zod";

// Everything here is written by a tenant and later shown on other people's websites,
// so every string has a length limit and every object rejects unknown keys.

// Reserved for the Step 6 honeypot; an owner's real field must never share its name.
const HONEYPOT_FIELD = "website";

const field = z.strictObject({
  // Becomes a key in submitted data. Lowercase letters, digits and underscores, starting with a
  // letter: no spaces or HTML, and no `__proto__` (the key that enables prototype pollution).
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,31}$/, "Use lowercase letters, digits and _, starting with a letter (max 32)")
    .refine((name) => name !== HONEYPOT_FIELD, `"${HONEYPOT_FIELD}" is a reserved field name`),
  label: z.string().trim().min(1).max(100),
  // Each type maps to one validator when Step 5 builds the submission schema.
  type: z.enum(["text", "email", "textarea"]),
  required: z.boolean().default(false), // safe here: a field is always sent whole
});

const display = z.strictObject({
  theme: z.enum(["light", "dark"]).optional(),
  // Ends up in CSS on the customer's page: allow exactly a hex colour, nothing that could inject CSS.
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a2b3c")
    .optional(),
});

// No .default() at this level: under .partial() a default would overwrite stored values on PATCH.
// A missing `display` on create is left to the column's DEFAULT '{}'.
const widget = z.strictObject({
  type: z.enum(["signup", "contact"]),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(), // null clears it on PATCH
  buttonText: z.string().trim().min(1).max(40),
  fields: z
    .array(field)
    .min(1)
    .max(10)
    .refine(
      (fields) => new Set(fields.map((f) => f.name)).size === fields.length,
      "Field names must be unique",
    ),
  display: display.optional(),
});

export const createWidgetSchema = widget;

// PATCH: any subset of keys, but not none. `fields`, if sent, replaces the whole list.
export const updateWidgetSchema = widget
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Provide at least one field to update");
