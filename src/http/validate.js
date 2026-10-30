import { ValidationError } from "../errors.js";

// Runs a zod schema at the HTTP boundary. Returns the parsed (and transformed) data, or throws
// a 422 whose details say which field failed and why. The rejected values are never echoed back.
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new ValidationError("Request validation failed", details);
  }
  return result.data;
}
