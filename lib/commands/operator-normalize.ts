import type {
  CommandGroup,
  CommandSchedule,
  CommandScheduleCadenceType,
  CommandScheduleRecurrence,
  OperatorActionType,
  OperatorCommandRun,
  OperatorCommandRunStatus,
  OperatorTargetType,
} from "@/types/command-operator"

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

const ACTIONS: readonly OperatorActionType[] = [
  "read",
  "relay_on",
  "relay_off",
]
const TARGETS: readonly OperatorTargetType[] = [
  "single_meter",
  "selected_meters",
  "saved_group",
]
const CADENCE: readonly CommandScheduleCadenceType[] = [
  "interval_minutes",
  "daily_time",
  "weekly",
]
const RUN_STATUSES: readonly OperatorCommandRunStatus[] = [
  "draft",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
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

function normalizeRecurrence(raw: unknown): CommandScheduleRecurrence {
  if (!raw || typeof raw !== "object") return {}
  const r = raw as Record<string, unknown>
  const out: CommandScheduleRecurrence = {}
  if (typeof r.intervalMinutes === "number" && Number.isFinite(r.intervalMinutes)) {
    out.intervalMinutes = Math.max(1, Math.floor(r.intervalMinutes))
  }
  const tl = nonEmptyString(r.timeLocal)
  if (tl) out.timeLocal = tl
  if (Array.isArray(r.daysOfWeek)) {
    out.daysOfWeek = r.daysOfWeek
      .filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
      .slice(0, 7)
  }
  return out
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

export function normalizeCommandSchedule(raw: unknown): CommandSchedule | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = nonEmptyString(r.id)
  const name = nonEmptyString(r.name)
  if (!id || !name) return null
  const actionType = isMember(r.actionType, ACTIONS) ? r.actionType : null
  const targetType = isMember(r.targetType, TARGETS) ? r.targetType : null
  const cadenceType = isMember(r.cadenceType, CADENCE) ? r.cadenceType : null
  if (!actionType || !targetType || !cadenceType) return null
  const enabled = Boolean(r.enabled)
  const groupId =
    r.groupId === null || r.groupId === undefined
      ? null
      : nonEmptyString(r.groupId)
  const notes = typeof r.notes === "string" ? r.notes.trim() : ""
  const createdAt = nonEmptyString(r.createdAt) ?? new Date().toISOString()
  const updatedAt = nonEmptyString(r.updatedAt) ?? createdAt
  return {
    id,
    name,
    enabled,
    actionType,
    targetType,
    meterIds: stringArray(r.meterIds),
    groupId,
    cadenceType,
    recurrence: normalizeRecurrence(r.recurrence),
    notes,
    createdAt,
    updatedAt,
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
  const targetType = isMember(r.targetType, TARGETS) ? r.targetType : null
  const status = isMember(r.status, RUN_STATUSES) ? r.status : null
  if (!actionType || !targetType || !status) return null
  const targetSummary =
    nonEmptyString(r.targetSummary) ?? "(no target summary)"
  const groupId =
    r.groupId === null || r.groupId === undefined
      ? null
      : nonEmptyString(r.groupId)
  const readProfileMode = nonEmptyString(r.readProfileMode) ?? undefined
  const createdAt = nonEmptyString(r.createdAt) ?? new Date().toISOString()
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

  return {
    id,
    actionType,
    targetType,
    targetSummary,
    meterIds: stringArray(r.meterIds),
    groupId,
    status,
    readProfileMode,
    createdAt,
    startedAt,
    finishedAt,
    resultSummary,
    errorSummary,
    executionNote,
  }
}

export function normalizeOperatorRuns(rows: unknown[]): OperatorCommandRun[] {
  return rows
    .map(normalizeOperatorRun)
    .filter((x): x is OperatorCommandRun => x !== null)
}
