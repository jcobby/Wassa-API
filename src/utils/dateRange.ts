import { HttpError } from "../middleware/error.js";

export type DateRange = { start?: Date; end?: Date };

// Ledger lists normally return the latest 200 rows. A dated report must add up
// to the real total, so a range lifts the cap to this (the console warns if a
// report ever reaches it).
export const RANGE_LIMIT = 2000;

function day(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ?from=YYYY-MM-DD&to=YYYY-MM-DD → a half-open range covering both days in
// full. WPN runs on Ghana time, which is UTC all year, so a calendar day there
// is exactly a UTC day.
export function parseDateRange(query: Record<string, unknown>): DateRange {
  const start = day(query.from);
  const to = day(query.to);
  const end = to ? new Date(to.getTime() + 86_400_000) : undefined;
  if (start && end && start >= end) {
    throw new HttpError(400, "The start date must be on or before the end date.");
  }
  return { start, end };
}

// Matches a ledger row by when it happened: when it was paid if it was,
// otherwise when the checkout was opened.
export function dateRangeClause(
  range: DateRange
): Record<string, unknown> | null {
  if (!range.start && !range.end) return null;
  const span: Record<string, Date> = {};
  if (range.start) span.$gte = range.start;
  if (range.end) span.$lt = range.end;
  return {
    $or: [{ completedAt: span }, { completedAt: null, createdAt: span }],
  };
}
