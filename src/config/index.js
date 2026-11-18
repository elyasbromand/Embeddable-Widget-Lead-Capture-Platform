import * as z from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // Origin customers' pages load our scripts from; goes into the embed snippet and the loader.
  // Trailing slash removed so `${PUBLIC_BASE_URL}/widget.js` never becomes `//widget.js`.
  // No ?query or #hash: anything appended after them would not be part of the path.
  PUBLIC_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .refine((url) => !/[?#]/.test(url), "PUBLIC_BASE_URL must not contain ? or #")
    .transform((url) => url.replace(/\/+$/, "")),
  // HS256 key. Short or guessable secrets can be brute-forced offline from any token we issue.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Dev only: geo looks up this IP instead of the visitor's (locally every visitor is 127.0.0.1).
  // `GEO_TEST_IP=` in .env arrives as "", which means "not set", so it becomes undefined first.
  GEO_TEST_IP: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.union([z.ipv4(), z.ipv6()], { error: "GEO_TEST_IP must be an IPv4 or IPv6 address" }).optional()
  ),
  // Fault injection: comma-separated provider names that throw instead of calling the network,
  // e.g. "ip-api.com" (A down) or "ip-api.com,ipapi.co" (both down). Empty = off.
  GEO_FORCE_DOWN: z
    .string()
    .default("")
    .transform((list) => list.split(",").map((name) => name.trim()).filter(Boolean))
    .pipe(z.array(z.enum(["ip-api.com", "ipapi.co"], { error: "GEO_FORCE_DOWN names must be ip-api.com or ipapi.co" }))),
  // Mail (Step 8). Locally Mailpit catches everything on port 1025; nothing leaves the machine.
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  MAIL_FROM: z.email(),
  // Fault injection: the mailer throws on every send, to prove retries and the dead-letter queue.
  // stringbool: "true"/"1"/"yes"/"on" -> true, "false"/"0"/"no"/"off" -> false, anything else fails.
  FORCE_EMAIL_FAILURE: z.stringbool().default(false),
}).refine((env) => !(env.NODE_ENV === "production" && env.GEO_TEST_IP), {
  // A fake visitor location must never reach production data.
  message: "GEO_TEST_IP must be empty when NODE_ENV=production",
  path: ["GEO_TEST_IP"],
}).refine((env) => !(env.NODE_ENV === "production" && env.GEO_FORCE_DOWN.length > 0), {
  // A forgotten test flag must not silently switch off geo in production.
  message: "GEO_FORCE_DOWN must be empty when NODE_ENV=production",
  path: ["GEO_FORCE_DOWN"],
}).refine((env) => !(env.NODE_ENV === "production" && env.FORCE_EMAIL_FAILURE), {
  message: "FORCE_EMAIL_FAILURE must be false when NODE_ENV=production",
  path: ["FORCE_EMAIL_FAILURE"],
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  // Logger isn't available yet (it reads config), so console is the right tool here.
  console.error("Invalid environment configuration:\n" + z.prettifyError(result.error));
  process.exit(1);
}

export const config = Object.freeze(result.data);
