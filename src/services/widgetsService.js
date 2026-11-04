import { randomBytes } from "node:crypto";
import { NotFoundError } from "../errors.js";
import * as widgetsRepository from "../repositories/widgetsRepository.js";
import { config } from "../config/index.js";

// The public id goes into embed snippets and URLs. 9 random bytes = 72 bits, 12 URL-safe chars:
// unguessable, so ids can't be enumerated. A collision would hit the UNIQUE index and fail loudly.
function newPublicId() {
  return randomBytes(9).toString("base64url");
}

// Same message whether the widget is missing or another tenant's.
const notFound = () => new NotFoundError("Widget not found");

export async function create(ownerId, data) {
  const widget = await widgetsRepository.createWidget(ownerId, newPublicId(), data);
  return addSnippet(widget);
}

export async function list(ownerId) {
  const widgets = await widgetsRepository.listWidgets(ownerId);
  return widgets.map(addSnippet);
}

export async function get(ownerId, publicId) {
  const widget = await widgetsRepository.findWidget(ownerId, publicId);
  if (!widget) throw notFound();
  return addSnippet(widget);
}

export async function update(ownerId, publicId, patch) {
  const widget = await widgetsRepository.updateWidget(ownerId, publicId, patch);
  if (!widget) throw notFound();
  return addSnippet(widget);
}

export async function remove(ownerId, publicId) {
  const deleted = await widgetsRepository.deleteWidget(ownerId, publicId);
  if (!deleted) throw notFound();
}

// The snippet is derived (base URL from env + public id), not stored, so changing
// PUBLIC_BASE_URL updates every widget's snippet without a migration.
function addSnippet(widget) {
  const src = `${config.PUBLIC_BASE_URL}/widget.js?id=${encodeURIComponent(widget.id)}`;
  return { ...widget, snippet: `<script src="${src}"></script>` };
}

// For visitors' browsers: no ownerId, no snippet (the page is already running it).
// An unknown id is the same 404 as everywhere else.
export async function getPublicConfig(publicId) {
  const widgetConfig = await widgetsRepository.findPublicConfig(publicId);
  if (!widgetConfig) throw notFound();
  return widgetConfig;
}
