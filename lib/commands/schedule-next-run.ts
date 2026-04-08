import type { CommandSchedule } from "@/types/command-operator"

const FAR_MS = Date.parse("2099-01-01T00:00:00.000Z")

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

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${day}`
}

function combineLocalDayAndHm(day: Date, hhmm: string): Date {
  const hm = parseHm(hhmm) ?? { h: 2, m: 0 }
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hm.h,
    hm.m,
    0,
    0
  )
}

/** HH:mm string comparison for same-day window (no overnight complexity beyond simple wrap). */
function hmInOptionalWindow(
  hm: string,
  startT: string | null,
  endT: string | null
): boolean {
  if (!startT && !endT) return true
  if (startT && !endT) return hm >= startT
  if (!startT && endT) return hm <= endT
  if (!startT || !endT) return true
  if (startT <= endT) return hm >= startT && hm <= endT
  return hm >= startT || hm <= endT
}

function hmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function daysBetweenUtcMidnight(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86400000)
}

function anchorDateForEveryN(schedule: CommandSchedule): Date {
  if (schedule.startDate) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(schedule.startDate)
    if (p) {
      return new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]), 0, 0, 0, 0)
    }
  }
  const t = Date.parse(schedule.createdAt)
  if (Number.isFinite(t)) return new Date(t)
  return new Date()
}

function matchesEveryNDays(
  schedule: CommandSchedule,
  candidateDay: Date
): boolean {
  const n = Math.max(1, schedule.intervalDays ?? 1)
  const anchor = anchorDateForEveryN(schedule)
  const diff = daysBetweenUtcMidnight(anchor, candidateDay)
  if (diff < 0) return false
  return diff % n === 0
}

/**
 * Whether `at` lies in schedule date range and optional daily wall-clock window.
 * Does not require minute match to runAtTime (used when deciding to skip a due nextRunAt).
 */
export function isScheduleContextuallyAllowed(
  schedule: CommandSchedule,
  at: Date
): boolean {
  const ymd = localYmd(at)
  if (schedule.startDate && ymd < schedule.startDate) return false
  if (schedule.endDate && ymd > schedule.endDate) return false
  const hm = hmFromDate(at)
  return hmInOptionalWindow(hm, schedule.startTime, schedule.endTime)
}

/**
 * Next fire strictly after `from`. Uses server local timezone.
 * `once` schedules with `lastRunAt` set return far future.
 */
export function computeNextRunAt(schedule: CommandSchedule, from: Date): Date {
  if (!schedule.enabled) {
    return new Date(FAR_MS)
  }

  if (schedule.scheduleType === "once" && schedule.lastRunAt) {
    return new Date(FAR_MS)
  }

  const runAt = schedule.runAtTime ?? "02:00"
  if (!parseHm(runAt)) {
    return new Date(FAR_MS)
  }

  const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0)

  for (let add = 0; add < 400; add++) {
    const day = new Date(startDay)
    day.setDate(day.getDate() + add)
    const ymd = localYmd(day)
    if (schedule.startDate && ymd < schedule.startDate) continue
    if (schedule.endDate && ymd > schedule.endDate) continue

    if (schedule.scheduleType === "every_n_days") {
      if (!matchesEveryNDays(schedule, day)) continue
    }

    const candidate = combineLocalDayAndHm(day, runAt)
    if (candidate.getTime() <= from.getTime()) continue

    const hm = hmFromDate(candidate)
    if (!hmInOptionalWindow(hm, schedule.startTime, schedule.endTime)) continue

    if (schedule.scheduleType === "once") {
      return candidate
    }

    return candidate
  }

  return new Date(FAR_MS)
}

/** True when wall-clock minute matches `runAtTime` (scheduler tick granularity). */
export function minuteMatchesRunAt(schedule: CommandSchedule, at: Date): boolean {
  const rt = schedule.runAtTime ?? "02:00"
  const want = parseHm(rt)
  if (!want) return true
  return at.getHours() === want.h && at.getMinutes() === want.m
}
