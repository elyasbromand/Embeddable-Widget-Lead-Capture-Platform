import request from "supertest";
import { createApp } from "../../src/http/app.js";
import { createSubmissionsService } from "../../src/services/submissionsService.js";
import { createGeoService } from "../../src/services/geoService.js";
import { createMockProvider } from "../../src/integrations/geo/mockProvider.js";

// Logger that records instead of printing, so tests can check what was (and was not) logged.
export function createFakeLogger() {
  const entries = [];
  const record = (level) => (obj, msg) => entries.push({ level, obj, msg });
  return { entries, info: record("info"), warn: record("warn"), error: record("error"), debug: record("debug") };
}

// Limits high enough that ordinary tests never meet them. Only the rate-limit tests pass small ones.
export const RELAXED_LIMITS = { windowMs: 60_000, perIp: 10_000, perWidget: 10_000 };

// A test app with everything outside our process replaced:
//  - geo: two mock providers (both "up" unless the test says otherwise), never the network
//  - email: a fake queue that records submission ids (or throws, with enqueueFails)
//  - geoTestIp 8.8.8.8: supertest connects from 127.0.0.1, which lookup skips as private; a public
//    address makes the providers actually get called. Mocks answer, so no request leaves the machine.
export function makeTestApp({ providerA, providerB, geoTimeoutMs = 1500, enqueueFails = false, rateLimits = RELAXED_LIMITS } = {}) {
  const a = providerA ?? createMockProvider({ name: "mock-a", result: { country: "US", region: "Virginia", city: "Ashburn" } });
  const b = providerB ?? createMockProvider({ name: "mock-b", result: { country: "DE", region: "Berlin", city: "Berlin" } });
  const logger = createFakeLogger();
  const enqueued = [];

  const submissionsService = createSubmissionsService({
    geoService: createGeoService({ providers: [a, b], timeoutMs: geoTimeoutMs, logger }),
    enqueueConfirmation: async (submissionId) => {
      if (enqueueFails) throw new Error("queue unavailable (test)");
      enqueued.push(submissionId);
    },
    geoTestIp: "8.8.8.8",
    logger,
  });

  const app = createApp({ submissionsService, rateLimits });
  return { app, http: request(app), providers: { a, b }, enqueued, logger };
}

// Register a fresh owner and return its token. Emails are unique per call.
let counter = 0;
export async function createOwner(http, label = "owner") {
  counter += 1;
  const email = `${label}-${counter}-${Date.now()}@example.com`;
  const res = await http.post("/auth/register").send({ email, password: "test-password-123" });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, token: res.body.token, userId: res.body.user.id };
}

export const SIGNUP_WIDGET = {
  type: "signup",
  title: "Test newsletter",
  buttonText: "Subscribe",
  fields: [
    { name: "email", label: "Email", type: "email", required: true },
    { name: "first_name", label: "First name", type: "text" },
  ],
};

// Create a widget for an owner; returns its public id.
export async function createWidget(http, token, widget = SIGNUP_WIDGET) {
  const res = await http.post("/api/widgets").set("Authorization", `Bearer ${token}`).send(widget);
  if (res.status !== 201) throw new Error(`create widget failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

// A visitor's POST /submissions from another origin.
export function submit(http, widgetId, fields = { email: "visitor@example.com" }, { website, idempotencyKey } = {}) {
  const req = http.post("/submissions").set("Origin", "http://localhost:5500");
  if (idempotencyKey) req.set("Idempotency-Key", idempotencyKey);
  const body = { widgetId, fields };
  if (website !== undefined) body.website = website;
  return req.send(body);
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });
