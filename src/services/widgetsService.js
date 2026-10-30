import { randomBytes } from "node:crypto";
import { NotFoundError } from "../errors.js";
import * as widgetsRepository from "../repositories/widgetsRepository.js";

// The public id goes into embed snippets and URLs. 9 random bytes = 72 bits, 12 URL-safe chars:
// unguessable, so ids can't be enumerated. A collision would hit the UNIQUE index and fail loudly.
function newPublicId() {
  return randomBytes(9).toString("base64url");
}

// Same message whether the widget is missing or another tenant's.
const notFound = () => new NotFoundError("Widget not found");

export function create(ownerId, data) {
  return widgetsRepository.createWidget(ownerId, newPublicId(), data);
}

export function list(ownerId) {
  return widgetsRepository.listWidgets(ownerId);
}

export async function get(ownerId, publicId) {
  const widget = await widgetsRepository.findWidget(ownerId, publicId);
  if (!widget) throw notFound();
  return widget;
}

export async function update(ownerId, publicId, patch) {
  const widget = await widgetsRepository.updateWidget(ownerId, publicId, patch);
  if (!widget) throw notFound();
  return widget;
}

export async function remove(ownerId, publicId) {
  const deleted = await widgetsRepository.deleteWidget(ownerId, publicId);
  if (!deleted) throw notFound();
}
