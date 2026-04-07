/**
 * Human-readable timestamps for operator surfaces (Scanner, etc.).
 * Raw ISO stays in diagnostics/API payloads only.
 */

const UTC_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const UTC_TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
})

/**
 * e.g. "07 Apr 2026, 10:58 PM UTC" (day-month-year + 12h clock, UTC).
 */
export function formatOperatorUtc(isoOrMs: string | number | null | undefined): string {
  if (isoOrMs === null || isoOrMs === undefined) return "—"
  const d =
    typeof isoOrMs === "number"
      ? Number.isFinite(isoOrMs)
        ? new Date(isoOrMs)
        : null
      : (() => {
          const t = isoOrMs.trim()
          if (!t) return null
          const x = new Date(t)
          return Number.isNaN(x.getTime()) ? null : x
        })()
  if (!d) return "—"
  return `${UTC_DATE.format(d)}, ${UTC_TIME.format(d)} UTC`
}
