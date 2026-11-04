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
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  // Logger isn't available yet (it reads config), so console is the right tool here.
  console.error("Invalid environment configuration:\n" + z.prettifyError(result.error));
  process.exit(1);
}

export const config = Object.freeze(result.data);
