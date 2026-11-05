import { NotFoundError } from "../errors.js";
import { parse } from "../http/validate.js";
import { buildFieldsSchema } from "../http/schemas/submissions.js";
import * as submissionsRepository from "../repositories/submissionsRepository.js";
import * as widgetsRepository from "../repositories/widgetsRepository.js";
import { publicIdSchema } from "../http/schemas/widgets.js";

export async function createSubmission({ widgetId, fields, ip }) {
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
  const submission = await submissionsRepository.insertSubmission({
    widgetId: widget.id,
    ownerId: widget.ownerId,
    data: parsedFields,
    ip,
  });

  return submission;
}
