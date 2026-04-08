import { COMMAND_SCHEDULE_TIMEZONE } from "@/lib/commands/schedule-baghdad"

/**
 * Commands UI: `YYYY-MM-DD | HH:mm:ss` in Asia/Baghdad, 24-hour, no timezone suffix.
 */
export function formatCommandBaghdadDateTime(
  isoOrMs: string | number | null | undefined
): string {
  if (isoOrMs === null || isoOrMs === undefined) return "—"
  const d =
    typeof isoOrMs === "number"
      ? Number.isFinite(isoOrMs)
        ? new Date(isoOrMs)
        : null
      : (() => {
          const t = String(isoOrMs).trim()
          if (!t) return null
          const x = new Date(t)
          return Number.isNaN(x.getTime()) ? null : x
        })()
  if (!d) return "—"

  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: COMMAND_SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = f.formatToParts(d)
  const m: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== "literal") m[p.type] = p.value
  }
  const y = m.year
  const mo = m.month
  const day = m.day
  const h = m.hour
  const mi = m.minute
  const sec = m.second
  if (!y || !mo || !day || !h || !mi || !sec) return "—"
  return `${y}-${mo}-${day} | ${h}:${mi}:${sec}`
}
