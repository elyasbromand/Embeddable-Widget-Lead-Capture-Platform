// Two demo tenants with one widget each. Safe to run again: existing users and widgets are reused.
// Goes through the schema and the services (not raw SQL), so seed data obeys the same rules as
// the API, including zod defaults such as `required: false`.
import { ConflictError } from "../src/errors.js";
import { createWidgetSchema } from "../src/http/schemas/widgets.js";
import { logger } from "../src/logger.js";
import { pool } from "../src/repositories/db.js";
import * as authService from "../src/services/authService.js";
import * as widgetsService from "../src/services/widgetsService.js";

// Local demo accounts only. This password is public on purpose; never reuse it anywhere real.
const DEMO_PASSWORD = "demo-password-123";

const tenants = [
  {
    email: "tenant-a@example.com",
    widget: {
      type: "signup",
      title: "Join our newsletter",
      description: "One email a month, no spam.",
      buttonText: "Subscribe",
      fields: [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "first_name", label: "First name", type: "text" },
      ],
      display: { theme: "light", accentColor: "#2563eb" },
    },
  },
  {
    email: "tenant-b@example.com",
    widget: {
      type: "contact",
      title: "Contact us",
      buttonText: "Send",
      fields: [
        { name: "name", label: "Your name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "message", label: "Message", type: "textarea", required: true },
      ],
      display: { theme: "dark" },
    },
  },
];

async function ensureUser(email) {
  try {
    return (await authService.register(email, DEMO_PASSWORD)).user;
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    return (await authService.login(email, DEMO_PASSWORD)).user;
  }
}

try {
  for (const tenant of tenants) {
    const user = await ensureUser(tenant.email);
    const existing = await widgetsService.list(user.id);
    const widget =
      existing[0] ?? (await widgetsService.create(user.id, createWidgetSchema.parse(tenant.widget)));
    logger.info({ email: user.email, widgetId: widget.id, created: !existing[0] }, "Seeded tenant");
  }
  logger.info(`Done. Log in as either tenant with password "${DEMO_PASSWORD}".`);
} finally {
  await pool.end(); // otherwise the open pool keeps the process alive
}
