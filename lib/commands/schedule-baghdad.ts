/**
 * Command schedules are interpreted in Asia/Baghdad (Iraq Standard Time, UTC+3, no DST).
 * Stored instants in JSON/API remain ISO-8601 in UTC; only interpretation + display use Baghdad.
 */

export const COMMAND_SCHEDULE_TIMEZONE = "Asia/Baghdad"

/** UTC+3 — matches current Iraq rules; used only to convert Baghdad wall-clock ↔ UTC instant. */
const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000

export function parseHm(s: string | null | undefined): { h: number; m: number } | null {
  if (!s) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59)
    return null
  return { h, m: min }
}

export function getBaghdadCalendarParts(d: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
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
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour: Number(m.hour),
    minute: Number(m.minute),
    second: Number(m.second),
  }
}

export function baghdadYmdFromDate(d: Date): string {
  const p = getBaghdadCalendarParts(d)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

export function hmFromDateBaghdad(d: Date): string {
  const p = getBaghdadCalendarParts(d)
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`
}

/**
 * `ymd` is a calendar date in Baghdad; `hhmm` is local time that day → absolute `Date` (UTC storage).
 */
export function baghdadWallClockToUtcDate(ymd: string, hhmm: string): Date | null {
  const dp = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  const hm = parseHm(hhmm)
  if (!dp || !hm) return null
  const y = Number(dp[1])
  const mo = Number(dp[2])
  const d = Number(dp[3])
  if (![y, mo, d].every((n) => Number.isFinite(n))) return null
  return new Date(
    Date.UTC(y, mo - 1, d, hm.h, hm.m, 0) - BAGHDAD_OFFSET_MS
  )
}

function ymdToUtcNoon(ymd: string): number {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!p) return NaN
  return Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]), 12, 0, 0)
}

/** Whole calendar days between two YYYY-MM-DD labels (Gregorian civil dates for schedule range). */
export function daysBetweenYmd(a: string, b: string): number {
  const ua = ymdToUtcNoon(a)
  const ub = ymdToUtcNoon(b)
  if (!Number.isFinite(ua) || !Number.isFinite(ub)) return 0
  return Math.round((ub - ua) / 86400000)
}

/**
 * Advance a Baghdad-calendar YYYY-MM-DD by `deltaDays` Gregorian days
 * (anchor at Baghdad noon to avoid boundary skew when re-projecting).
 */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const base = baghdadWallClockToUtcDate(ymd, "12:00")
  if (!base) return ymd
  return baghdadYmdFromDate(
    new Date(base.getTime() + deltaDays * 86_400_000)
  )
}
