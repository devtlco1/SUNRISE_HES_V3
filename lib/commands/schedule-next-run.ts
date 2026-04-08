import {
  addDaysToYmd,
  baghdadWallClockToUtcDate,
  baghdadYmdFromDate,
  daysBetweenYmd,
  getBaghdadCalendarParts,
  hmFromDateBaghdad,
  parseHm,
} from "@/lib/commands/schedule-baghdad"
import type { CommandSchedule } from "@/types/command-operator"

/** Sentinel instant: “no next run” (stored as ISO in persisted rows). */
export const COMMAND_SCHEDULE_FAR_MS = Date.parse("2099-01-01T00:00:00.000Z")

/** True when `nextRunAt` is the far-future placeholder (or beyond). */
export function isCommandScheduleFarNextRun(
  iso: string | null | undefined
): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= COMMAND_SCHEDULE_FAR_MS - 86_400_000
}

/** HH:mm string comparison for same-day window (Baghdad wall-clock labels). */
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

function anchorYmdForEveryN(schedule: CommandSchedule): string {
  if (schedule.startDate) return schedule.startDate
  const t = Date.parse(schedule.createdAt)
  if (Number.isFinite(t)) return baghdadYmdFromDate(new Date(t))
  return baghdadYmdFromDate(new Date())
}

function matchesEveryNDays(schedule: CommandSchedule, ymd: string): boolean {
  const n = Math.max(1, schedule.intervalDays ?? 1)
  const anchor = anchorYmdForEveryN(schedule)
  const diff = daysBetweenYmd(anchor, ymd)
  if (diff < 0) return false
  return diff % n === 0
}

/**
 * Whether `at` lies in schedule date range and optional daily wall-clock window (Baghdad).
 */
export function isScheduleContextuallyAllowed(
  schedule: CommandSchedule,
  at: Date
): boolean {
  const ymd = baghdadYmdFromDate(at)
  if (schedule.startDate && ymd < schedule.startDate) return false
  if (schedule.endDate && ymd > schedule.endDate) return false
  const hm = hmFromDateBaghdad(at)
  return hmInOptionalWindow(hm, schedule.startTime, schedule.endTime)
}

/**
 * Next fire strictly after `from` (absolute instant). Wall-clock fields are interpreted in Asia/Baghdad.
 * `once` schedules with `lastRunAt` set return far future.
 */
export function computeNextRunAt(schedule: CommandSchedule, from: Date): Date {
  if (!schedule.enabled) {
    return new Date(COMMAND_SCHEDULE_FAR_MS)
  }

  if (schedule.scheduleType === "once" && schedule.lastRunAt) {
    return new Date(COMMAND_SCHEDULE_FAR_MS)
  }

  const runAt = schedule.runAtTime ?? "02:00"
  const runAtHm = parseHm(runAt)
  if (!runAtHm) {
    return new Date(COMMAND_SCHEDULE_FAR_MS)
  }

  const runAtHmLabel = `${String(runAtHm.h).padStart(2, "0")}:${String(runAtHm.m).padStart(2, "0")}`
  const startYmd = baghdadYmdFromDate(from)

  for (let add = 0; add < 400; add++) {
    const ymd = addDaysToYmd(startYmd, add)
    if (schedule.startDate && ymd < schedule.startDate) continue
    if (schedule.endDate && ymd > schedule.endDate) continue

    if (schedule.scheduleType === "every_n_days") {
      if (!matchesEveryNDays(schedule, ymd)) continue
    }

    const candidate = baghdadWallClockToUtcDate(ymd, runAt)
    if (!candidate) continue
    if (candidate.getTime() <= from.getTime()) continue

    if (!hmInOptionalWindow(runAtHmLabel, schedule.startTime, schedule.endTime))
      continue

    if (schedule.scheduleType === "once") {
      return candidate
    }

    return candidate
  }

  return new Date(COMMAND_SCHEDULE_FAR_MS)
}

/** True when Baghdad wall-clock minute matches `runAtTime` (scheduler tick granularity). */
export function minuteMatchesRunAt(schedule: CommandSchedule, at: Date): boolean {
  const rt = schedule.runAtTime ?? "02:00"
  const want = parseHm(rt)
  if (!want) return true
  const p = getBaghdadCalendarParts(at)
  return p.hour === want.h && p.minute === want.m
}

// Re-export for API consumers that imported parseHm from this module
export { parseHm } from "@/lib/commands/schedule-baghdad"
