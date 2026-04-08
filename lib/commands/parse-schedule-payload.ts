import type { CommandScheduleType } from "@/types/command-operator"

const SCHEDULE_TYPES: readonly CommandScheduleType[] = [
  "once",
  "daily",
  "every_n_days",
]

function isMember<T extends string>(
  v: unknown,
  allowed: readonly T[]
): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
}

function nullableTrimmedString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v !== "string") return null
  const t = v.trim()
  return t === "" ? null : t
}

export type ParsedScheduleBody = {
  name: string
  enabled: boolean
  scheduleType: CommandScheduleType
  intervalDays: number | null
  startDate: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
  runAtTime: string | null
  notes: string
  meterGroupId: string | null
  obisCodeGroupId: string | null
}

export function parseScheduleBody(
  o: Record<string, unknown>
): { ok: true; value: ParsedScheduleBody } | { ok: false; error: string } {
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) return { ok: false, error: "NAME_REQUIRED" }

  const enabled = Boolean(o.enabled)
  const scheduleType = o.scheduleType
  if (!isMember(scheduleType, SCHEDULE_TYPES)) {
    return { ok: false, error: "INVALID_SCHEDULE_TYPE" }
  }

  let intervalDays: number | null = null
  if (o.intervalDays === null || o.intervalDays === undefined || o.intervalDays === "") {
    intervalDays = scheduleType === "every_n_days" ? null : null
  } else if (typeof o.intervalDays === "number" && Number.isFinite(o.intervalDays)) {
    intervalDays = Math.max(1, Math.floor(o.intervalDays))
  } else {
    return { ok: false, error: "INVALID_INTERVAL_DAYS" }
  }

  if (scheduleType === "every_n_days" && (intervalDays === null || intervalDays < 1)) {
    return { ok: false, error: "INTERVAL_DAYS_REQUIRED_FOR_EVERY_N_DAYS" }
  }

  if (scheduleType !== "every_n_days") {
    intervalDays = null
  }

  const notes = typeof o.notes === "string" ? o.notes.trim() : ""

  const meterGroupId = nullableTrimmedString(o.meterGroupId)
  const obisCodeGroupId = nullableTrimmedString(o.obisCodeGroupId)

  if (enabled && (!meterGroupId || !obisCodeGroupId)) {
    return {
      ok: false,
      error: "ENABLED_SCHEDULE_REQUIRES_METER_GROUP_AND_OBIS_GROUP",
    }
  }

  return {
    ok: true,
    value: {
      name,
      enabled,
      scheduleType,
      intervalDays,
      startDate: nullableTrimmedString(o.startDate),
      endDate: nullableTrimmedString(o.endDate),
      startTime: nullableTrimmedString(o.startTime),
      endTime: nullableTrimmedString(o.endTime),
      runAtTime: nullableTrimmedString(o.runAtTime),
      notes,
      meterGroupId,
      obisCodeGroupId,
    },
  }
}
