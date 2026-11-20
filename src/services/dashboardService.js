import { NotFoundError, ValidationError } from "../errors.js";
import * as dashboardRepository from "../repositories/dashboardRepository.js";
import * as widgetsRepository from "../repositories/widgetsRepository.js";

// The cursor is opaque to the client: base64url of {"t": created_at as Postgres text, "id": uuid}.
// The client only echoes back the nextCursor it was given. A tampered cursor is a 422, never a 500,
// and it cannot reach other tenants' rows: the query is still owner-scoped.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ t: row.cursorTime, id: row.id })).toString("base64url");
}

function decodeCursor(cursor) {
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof t === "string" && !Number.isNaN(Date.parse(t)) && UUID.test(id)) return { time: t, id };
  } catch {
    // falls through to the 422
  }
  throw new ValidationError("Request validation failed", [{ path: "cursor", message: "Invalid cursor" }]);
}

export async function listSubmissions(ownerId, { widgetId, limit, cursor }) {
  // Filtering by another tenant's widget is a 404, the same as an unknown widget (not an empty list).
  if (widgetId && !(await widgetsRepository.findWidget(ownerId, widgetId))) {
    throw new NotFoundError("Widget not found");
  }

  // Ask for one extra row: if it comes back, there is a next page.
  const rows = await dashboardRepository.listSubmissions(ownerId, {
    widgetPublicId: widgetId,
    limit: limit + 1,
    after: cursor ? decodeCursor(cursor) : undefined,
  });
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return {
    items: page.map(({ cursorTime, ...item }) => item),
    nextCursor: hasMore ? encodeCursor(page.at(-1)) : null,
  };
}

// The four queries are independent, so they run in parallel (each on its own pool connection).
export async function overview(ownerId, { days }) {
  const [totals, perWidget, perDay, byCountry] = await Promise.all([
    dashboardRepository.countTotals(ownerId),
    dashboardRepository.countPerWidget(ownerId),
    dashboardRepository.countPerDay(ownerId, days),
    dashboardRepository.countByCountry(ownerId),
  ]);
  return { totals, perWidget, perDay: { days, counts: perDay }, byCountry };
}
