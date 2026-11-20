import { randomUUID } from "node:crypto";
import { NotFoundError } from "../errors.js";
import { parse } from "../http/validate.js";
import { buildFieldsSchema } from "../http/schemas/submissions.js";
import * as submissionsRepository from "../repositories/submissionsRepository.js";
import * as widgetsRepository from "../repositories/widgetsRepository.js";
import { publicIdSchema } from "../http/schemas/widgets.js";
import { logger as defaultLogger } from "../logger.js";
import { geoService as defaultGeoService } from "./geoService.js";
import { config } from "../config/index.js";
import { boss } from "../jobs/producer.js";
import { CONFIRMATION_EMAIL } from "../jobs/queues.js";

// The real widget sends the hidden `website` input as "" or leaves it out. Any other value
// (text, spaces, a number, null) can only come from something that filled a field no human sees.
const isHoneypotFilled = (website) => website !== undefined && website !== "";

// The side effects (geo lookup, email queue) are injected, so tests run the whole pipeline
// against a real database with mock providers and a fake queue: no network, no pg-boss.
//   geoService:          { lookup(ip) } that never throws (null on failure)
//   enqueueConfirmation: (submissionId) => Promise, may throw
//   geoTestIp:           dev override (GEO_TEST_IP), undefined in production
export function createSubmissionsService({ geoService, enqueueConfirmation, geoTestIp, logger = defaultLogger }) {
  return {
    async createSubmission({ widgetId, fields, ip, website, idempotencyKey }) {
      const parsedWidgetId = publicIdSchema.safeParse(widgetId);
      if (!parsedWidgetId.success) {
        throw new NotFoundError("Widget not found");
      }
      const widget = await widgetsRepository.findWidgetForSubmission(parsedWidgetId.data);
      if (!widget) {
        throw new NotFoundError("Widget not found");
      }

      const fieldsSchema = buildFieldsSchema(widget.fields);
      const parsedFields = parse(fieldsSchema, fields);

      // Honeypot, checked AFTER validation: a bot gets the same 404/422 as anyone else, so the only
      // difference a filled honeypot makes is that nothing is inserted. The fake has the same shape
      // as a real insert ({ id, createdAt }), so the bot cannot tell it was caught.
      // Logged to count hits; no IP (personal data) and not the value (attacker-controlled text).
      if (isHoneypotFilled(website)) {
        logger.info({ event: "honeypot_hit", widgetId: parsedWidgetId.data }, "Honeypot filled; submission dropped");
        const fakeSubmission = { id: randomUUID(), createdAt: new Date() };
        return fakeSubmission;
      }

      // After the honeypot, so bots never spend our geo quota. lookup never throws: null on failure.
      // geoTestIp (dev only) replaces the IP for geo; the stored ip stays the real one.
      const geo = await geoService.lookup(geoTestIp ?? ip);

      const submission = await submissionsRepository.insertSubmission({
        widgetId: widget.id,
        ownerId: widget.ownerId,
        data: parsedFields,
        ip,
        geo,
        idempotencyKey,
      });

      // After the insert has committed, so the worker can always load the row it is told about.
      // Email is a side effect: a failed enqueue is logged and the visitor still gets 201.
      try {
        await enqueueConfirmation(submission.id);
      } catch (err) {
        logger.error({ submissionId: submission.id, error: err.message }, "Could not enqueue confirmation email");
      }

      return submission;
    },
  };
}

// The app's instance: real geo chain, real pg-boss queue.
// Only the id goes in the job: no personal data copied into pg-boss's table.
// `id: submissionId` makes a second send for the same submission (an Idempotency-Key retry)
// return null instead of queueing a second email. singletonKey would not dedupe on a standard queue.
export const submissionsService = createSubmissionsService({
  geoService: defaultGeoService,
  enqueueConfirmation: (submissionId) => boss.send(CONFIRMATION_EMAIL, { submissionId }, { id: submissionId }),
  geoTestIp: config.GEO_TEST_IP,
});
