import * as z from "zod";


// registerSchema: { email, password }
//   - email: trimmed, lowercased (the users table has CHECK (email = lower(email))), valid format
//   - password: a minimum length (OWASP: at least 8) and a sensible maximum (hashing is costly,
//     so an unbounded password is a cheap way to make the server work hard)
//   - unknown keys rejected
// loginSchema: { email, password }
//   - email normalized the same way, or "Me@x.com" would never match the stored "me@x.com"
//   - password: present and a string; no strength rules here (they belong to registration)
//

export const registerSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(256),
});

export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
});