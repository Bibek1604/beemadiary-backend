/**
 * Timezone-safe business date helpers (Asia/Kathmandu by default).
 *
 * All "today" / "this month" / lapse-threshold decisions must go through
 * these helpers so they are correct regardless of the server's timezone.
 */

const BUSINESS_TZ = process.env.DASHBOARD_TIMEZONE || "Asia/Kathmandu";

const pad2 = (n) => String(n).padStart(2, "0");

/** Current date parts in the business timezone. */
function getTodayParts() {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = formatted.split("-").map(Number);
  return { year, month, day, iso: `${year}-${pad2(month)}-${pad2(day)}` };
}

/**
 * Parse a stored date (string or Date) into calendar parts WITHOUT timezone
 * shifting, rejecting impossible dates like 2026-02-30.
 */
function parseDateParts(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      // Round-trip through UTC to reject impossible dates (e.g. Feb 30)
      const d = new Date(Date.UTC(year, month - 1, day));
      if (
        d.getUTCFullYear() === year &&
        d.getUTCMonth() === month - 1 &&
        d.getUTCDate() === day
      ) {
        return { year, month, day };
      }
      return null;
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const toIsoDate = (parts) =>
  parts ? `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` : null;

/** Compare two {year,month,day} parts: -1, 0, 1. */
function compareParts(a, b) {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/**
 * Calendar-aware "N months before" with end-of-month clamping
 * (e.g. Aug 31 minus 6 months -> Feb 28/29).
 */
function subtractMonths(parts, months) {
  let y = parts.year;
  let m = parts.month - months;
  while (m < 1) { m += 12; y -= 1; }
  const daysInTarget = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { year: y, month: m, day: Math.min(parts.day, daysInTarget) };
}

/**
 * 6-month lapse rule (day-aware, business timezone):
 *   - due exactly N months ago        -> NOT lapsed
 *   - due N months ago + 1 day (older)-> lapsed
 */
function isLapsedDueDate(dueDateValue, months = 6, today = getTodayParts()) {
  const dueParts = parseDateParts(dueDateValue);
  if (!dueParts) return false;
  const threshold = subtractMonths(today, months);
  return compareParts(dueParts, threshold) < 0; // strictly older than the threshold
}

/** Whole months a due date is overdue (0 if not in the past). */
function monthsOverdue(dueDateValue, today = getTodayParts()) {
  const dueParts = parseDateParts(dueDateValue);
  if (!dueParts) return 0;
  let months =
    (today.year - dueParts.year) * 12 + (today.month - dueParts.month);
  if (today.day < dueParts.day) months -= 1;
  return Math.max(0, months);
}

/** Whole days a due date is overdue (negative => due in the future). */
function daysOverdue(dueDateValue, today = getTodayParts()) {
  const dueParts = parseDateParts(dueDateValue);
  if (!dueParts) return 0;
  const dueUtc = Date.UTC(dueParts.year, dueParts.month - 1, dueParts.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((todayUtc - dueUtc) / 86400000);
}

/**
 * UTC instant of local (business-timezone) midnight for a calendar date.
 * Useful for building created_at range queries that align with Kathmandu days.
 */
function businessMidnightUtc(year, month, day) {
  // Asia/Kathmandu is UTC+5:45 (no DST)
  const OFFSET_MIN = 5 * 60 + 45;
  return new Date(Date.UTC(year, month - 1, day) - OFFSET_MIN * 60000);
}

module.exports = {
  BUSINESS_TZ,
  getTodayParts,
  parseDateParts,
  toIsoDate,
  compareParts,
  subtractMonths,
  isLapsedDueDate,
  monthsOverdue,
  daysOverdue,
  businessMidnightUtc,
};
