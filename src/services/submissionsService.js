import { randomUUID } from "node:crypto";
import { NotFoundError } from "../errors.js";
import { parse } from "../http/validate.js";
import { buildFieldsSchema } from "../http/schemas/submissions.js";
import * as submissionsRepository from "../repositories/submissionsRepository.js";
import * as widgetsRepository from "../repositories/widgetsRepository.js";
import { publicIdSchema } from "../http/schemas/widgets.js";
import { logger } from "../logger.js";
import { geoService } from "./geoService.js";
import { config } from "../config/index.js";

// The real widget sends the hidden `website` input as "" or leaves it out. Any other value
// (text, spaces, a number, null) can only come from something that filled a field no human sees.
const isHoneypotFilled = (website) => website !== undefined && website !== "";

export async function createSubmission({ widgetId, fields, ip, website, idempotencyKey }) {
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
  // GEO_TEST_IP (dev only) replaces the IP for geo; the stored ip stays the real one.
  const geo = await geoService.lookup(config.GEO_TEST_IP ?? ip);

  const submission = await submissionsRepository.insertSubmission({
    widgetId: widget.id,
    ownerId: widget.ownerId,
    data: parsedFields,
    ip,
    geo,
    idempotencyKey,
  });

  return submission;
}
