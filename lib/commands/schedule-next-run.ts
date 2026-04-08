import type { CommandSchedule } from "@/types/command-operator"

/**
 * Computes the next fire time after `from`.
 * Uses the Node process local timezone for calendar fields (set TZ in production if needed).
 */

function parseTimeLocal(tl: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(tl.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null
  }
  return { h, m: min }
}

function nextWeeklyOccurrence(
  from: Date,
  daysOfWeek: number[],
  hour: number,
  minute: number
): Date {
  const sorted = [...new Set(daysOfWeek.filter((d) => d >= 0 && d <= 6))].sort(
    (a, b) => a - b
  )
  if (sorted.length === 0) {
    sorted.push(1)
  }
  for (let add = 0; add <= 14; add++) {
    const d = new Date(from)
    d.setDate(d.getDate() + add)
    const dow = d.getDay()
    if (!sorted.includes(dow)) continue
    const candidate = new Date(d)
    candidate.setHours(hour, minute, 0, 0)
    if (candidate.getTime() > from.getTime()) {
      return candidate
    }
  }
  const fallback = new Date(from)
  fallback.setDate(fallback.getDate() + 7)
  fallback.setHours(hour, minute, 0, 0)
  return fallback
}

export function computeNextRunAt(schedule: CommandSchedule, from: Date): Date {
  if (schedule.cadenceType === "interval_minutes") {
    const mins = Math.max(1, schedule.recurrence.intervalMinutes ?? 60)
    return new Date(from.getTime() + mins * 60_000)
  }

  if (schedule.cadenceType === "daily_time") {
    const tl =
      parseTimeLocal(schedule.recurrence.timeLocal ?? "00:00") ??
      parseTimeLocal("00:00")!
    const d = new Date(from)
    d.setHours(tl.h, tl.m, 0, 0)
    if (d.getTime() <= from.getTime()) {
      d.setDate(d.getDate() + 1)
    }
    return d
  }

  if (schedule.cadenceType === "weekly") {
    const days =
      schedule.recurrence.daysOfWeek && schedule.recurrence.daysOfWeek.length > 0
        ? schedule.recurrence.daysOfWeek
        : [1]
    const tl =
      parseTimeLocal(schedule.recurrence.timeLocal ?? "09:00") ??
      parseTimeLocal("09:00")!
    return nextWeeklyOccurrence(from, days, tl.h, tl.m)
  }

  return new Date(from.getTime() + 60_000)
}
