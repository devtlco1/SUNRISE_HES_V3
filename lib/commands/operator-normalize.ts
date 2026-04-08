import type {
  CommandGroup,
  CommandSchedule,
  CommandScheduleType,
  ObisCodeGroup,
  OperatorActionType,
  OperatorCommandMeterResult,
  OperatorCommandRun,
  OperatorCommandRunStatus,
  OperatorRunSourceType,
} from "@/types/command-operator"

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

const ACTIONS: readonly OperatorActionType[] = [
  "read",
  "relay_on",
  "relay_off",
]
const RUN_STATUSES: readonly OperatorCommandRunStatus[] = [
  "draft",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]
const RUN_SOURCES: readonly OperatorRunSourceType[] = ["manual", "schedule"]
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

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
}

function normalizeMeterResult(raw: unknown): OperatorCommandMeterResult | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const meterId = nonEmptyString(r.meterId)
  const serialNumber = nonEmptyString(r.serialNumber) ?? meterId ?? ""
  const state = r.state === "success" || r.state === "failed" ? r.state : null
  const summary =
    typeof r.summary === "string" ? r.summary : "(no summary)"
  const finishedAt =
    nonEmptyString(r.finishedAt) ?? new Date().toISOString()
  if (!meterId || !state) return null
  const errorDetail = nonEmptyString(r.errorDetail) ?? undefined
  return {
    meterId,
    serialNumber,
    state,
    summary,
    finishedAt,
    errorDetail,
  }
}

export function normalizeCommandGroup(raw: unknown): CommandGroup | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = nonEmptyString(r.id)
  const name = nonEmptyString(r.name)
  if (!id || !name) return null
  const description =
    typeof r.description === "string" ? r.description.trim() : ""
  const createdAt = nonEmptyString(r.createdAt) ?? new Date().toISOString()
  const updatedAt = nonEmptyString(r.updatedAt) ?? createdAt
  return {
    id,
    name,
    description,
    memberMeterIds: stringArray(r.memberMeterIds),
    createdAt,
    updatedAt,
  }
}

export function normalizeCommandGroups(rows: unknown[]): CommandGroup[] {
  return rows.map(normalizeCommandGroup).filter((x): x is CommandGroup => x !== null)
}

export function normalizeObisCodeGroup(raw: unknown): ObisCodeGroup | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = nonEmptyString(r.id)
  const name = nonEmptyString(r.name)
  if (!id || !name) return null
  const description =
    typeof r.description === "string" ? r.description.trim() : ""
  const createdAt = nonEmptyString(r.createdAt) ?? new Date().toISOString()
  const updatedAt = nonEmptyString(r.updatedAt) ?? createdAt
  return {
    id,
    name,
    description,
    objectCodes: stringArray(r.objectCodes),
    createdAt,
    updatedAt,
  }
}

export function normalizeObisCodeGroups(rows: unknown[]): ObisCodeGroup[] {
  return rows.map(normalizeObisCodeGroup).filter((x): x is ObisCodeGroup => x !== null)
}

/** Migrate pre-refactor schedules (cadenceType / recurrence / embedded targets). */
function migrateLegacyScheduleShape(
  r: Record<string, unknown>
): Record<string, unknown> {
  if (!("cadenceType" in r) && isMember(r.scheduleType, SCHEDULE_TYPES)) {
    return r
  }
  if (!("cadenceType" in r)) return r

  const rec =
    r.recurrence && typeof r.recurrence === "object" && !Array.isArray(r.recurrence)
      ? (r.recurrence as Record<string, unknown>)
      : {}
  const cadence = r.cadenceType
  let scheduleType: CommandScheduleType = "daily"
  let intervalDays: number | null = null
  let runAtTime = nonEmptyString(rec.timeLocal) ?? "02:00"

  if (cadence === "interval_minutes") {
    scheduleType = "every_n_days"
    const mins =
      typeof rec.intervalMinutes === "number" && Number.isFinite(rec.intervalMinutes)
        ? Math.max(1, Math.floor(rec.intervalMinutes))
        : 1440
    intervalDays = Math.max(1, Math.round(mins / 1440) || 1)
  } else if (cadence === "weekly") {
    scheduleType = "daily"
  }

  const legacyGroup =
    r.targetType === "saved_group"
      ? nonEmptyString(r.groupId)
      : null

  return {
    ...r,
    scheduleType,
    intervalDays,
    runAtTime,
    startDate: r.startDate ?? null,
    endDate: r.endDate ?? null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    meterGroupId: r.meterGroupId ?? legacyGroup,
    obisCodeGroupId: r.obisCodeGroupId ?? null,
    cadenceType: undefined,
    recurrence: undefined,
    actionType: undefined,
    targetType: undefined,
    meterIds: undefined,
    groupId: undefined,
  }
}

export function normalizeCommandSchedule(raw: unknown): CommandSchedule | null {
  if (!raw || typeof raw !== "object") return null
  let r = raw as Record<string, unknown>
  r = migrateLegacyScheduleShape(r)

  const id = nonEmptyString(r.id)
  const name = nonEmptyString(r.name)
  if (!id || !name) return null
  const st = isMember(r.scheduleType, SCHEDULE_TYPES) ? r.scheduleType : null
  if (!st) return null

  const enabled = Boolean(r.enabled)
  const intervalDays =
    r.intervalDays === null || r.intervalDays === undefined
      ? null
      : typeof r.intervalDays === "number" && Number.isFinite(r.intervalDays)
        ? Math.max(1, Math.floor(r.intervalDays))
        : null
  const startDate =
    r.startDate === null || r.startDate === undefined
      ? null
      : nonEmptyString(r.startDate)
  const endDate =
    r.endDate === null || r.endDate === undefined
      ? null
      : nonEmptyString(r.endDate)
  const startTime =
    r.startTime === null || r.startTime === undefined
      ? null
      : nonEmptyString(r.startTime)
  const endTime =
    r.endTime === null || r.endTime === undefined
      ? null
      : nonEmptyString(r.endTime)
  const runAtTime =
    r.runAtTime === null || r.runAtTime === undefined
      ? null
      : nonEmptyString(r.runAtTime)
  const notes = typeof r.notes === "string" ? r.notes.trim() : ""
  const meterGroupId =
    r.meterGroupId === null || r.meterGroupId === undefined
      ? null
      : nonEmptyString(r.meterGroupId)
  const obisCodeGroupId =
    r.obisCodeGroupId === null || r.obisCodeGroupId === undefined
      ? null
      : nonEmptyString(r.obisCodeGroupId)
  const createdAt = nonEmptyString(r.createdAt) ?? new Date().toISOString()
  const updatedAt = nonEmptyString(r.updatedAt) ?? createdAt
  const lastRunAt =
    r.lastRunAt === null || r.lastRunAt === undefined
      ? null
      : nonEmptyString(r.lastRunAt)
  const nextRunAt =
    r.nextRunAt === null || r.nextRunAt === undefined
      ? null
      : nonEmptyString(r.nextRunAt)
  const lastRunId =
    r.lastRunId === null || r.lastRunId === undefined
      ? null
      : nonEmptyString(r.lastRunId)
  const lastOutcomeSummary =
    typeof r.lastOutcomeSummary === "string" ? r.lastOutcomeSummary : ""
  const lastSchedulerNote =
    typeof r.lastSchedulerNote === "string" ? r.lastSchedulerNote : ""

  return {
    id,
    name,
    enabled,
    scheduleType: st,
    intervalDays,
    startDate,
    endDate,
    startTime,
    endTime,
    runAtTime,
    notes,
    meterGroupId,
    obisCodeGroupId,
    createdAt,
    updatedAt,
    lastRunAt,
    nextRunAt,
    lastRunId,
    lastOutcomeSummary,
    lastSchedulerNote,
  }
}

export function normalizeCommandSchedules(rows: unknown[]): CommandSchedule[] {
  return rows
    .map(normalizeCommandSchedule)
    .filter((x): x is CommandSchedule => x !== null)
}

export function normalizeOperatorRun(raw: unknown): OperatorCommandRun | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = nonEmptyString(r.id)
  if (!id) return null
  const actionType = isMember(r.actionType, ACTIONS) ? r.actionType : null
  const targetType = nonEmptyString(r.targetType) as
    | OperatorCommandRun["targetType"]
    | null
  const status = isMember(r.status, RUN_STATUSES) ? r.status : null
  if (!actionType || !status) return null

  const tt: OperatorCommandRun["targetType"] =
    targetType === "single_meter" ||
    targetType === "selected_meters" ||
    targetType === "saved_group"
      ? targetType
      : "saved_group"

  const sourceType: OperatorRunSourceType = isMember(
    r.sourceType,
    RUN_SOURCES
  )
    ? r.sourceType
    : "manual"
  const scheduleId =
    r.scheduleId === null || r.scheduleId === undefined
      ? null
      : nonEmptyString(r.scheduleId)
  const targetSummary =
    nonEmptyString(r.targetSummary) ?? "(no target summary)"
  const groupId =
    r.groupId === null || r.groupId === undefined
      ? null
      : nonEmptyString(r.groupId)
  const meterIds = stringArray(r.meterIds)
  const resolvedRaw = r.resolvedMeterIds
  const resolvedMeterIds =
    Array.isArray(resolvedRaw) && resolvedRaw.length > 0
      ? stringArray(resolvedRaw)
      : meterIds

  const meterGroupId =
    r.meterGroupId === null || r.meterGroupId === undefined
      ? null
      : nonEmptyString(r.meterGroupId)
  const obisCodeGroupId =
    r.obisCodeGroupId === null || r.obisCodeGroupId === undefined
      ? null
      : nonEmptyString(r.obisCodeGroupId)
  const meterGroupName =
    typeof r.meterGroupName === "string" ? r.meterGroupName : ""
  const obisCodeGroupName =
    typeof r.obisCodeGroupName === "string" ? r.obisCodeGroupName : ""
  const scheduleName =
    typeof r.scheduleName === "string" ? r.scheduleName : ""

  const readProfileMode = nonEmptyString(r.readProfileMode) ?? undefined
  const createdAt = nonEmptyString(r.createdAt) ?? new Date().toISOString()
  const queuedAt = nonEmptyString(r.queuedAt) ?? createdAt
  const startedAt =
    r.startedAt === null ? null : nonEmptyString(r.startedAt)
  const finishedAt =
    r.finishedAt === null ? null : nonEmptyString(r.finishedAt)
  const resultSummary =
    typeof r.resultSummary === "string" ? r.resultSummary : ""
  const errorSummary =
    r.errorSummary === null || r.errorSummary === undefined
      ? null
      : typeof r.errorSummary === "string"
        ? r.errorSummary
        : null
  const executionNote =
    typeof r.executionNote === "string" ? r.executionNote : ""

  const pmRaw = r.perMeterResults
  const perMeterResults: OperatorCommandMeterResult[] = Array.isArray(pmRaw)
    ? pmRaw
        .map(normalizeMeterResult)
        .filter((x): x is OperatorCommandMeterResult => x !== null)
    : []

  return {
    id,
    sourceType,
    scheduleId,
    actionType,
    targetType: tt,
    targetSummary,
    meterIds,
    resolvedMeterIds,
    groupId,
    meterGroupId,
    obisCodeGroupId,
    meterGroupName,
    obisCodeGroupName,
    scheduleName,
    status,
    readProfileMode,
    createdAt,
    queuedAt,
    startedAt,
    finishedAt,
    resultSummary,
    errorSummary,
    executionNote,
    perMeterResults,
  }
}

export function normalizeOperatorRuns(rows: unknown[]): OperatorCommandRun[] {
  return rows
    .map(normalizeOperatorRun)
    .filter((x): x is OperatorCommandRun => x !== null)
}
