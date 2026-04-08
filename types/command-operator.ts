/** Operator command section — persisted definitions and run records. */

export type OperatorActionType = "read" | "relay_on" | "relay_off"

export type OperatorTargetType =
  | "single_meter"
  | "selected_meters"
  | "saved_group"

export type CommandScheduleCadenceType =
  | "interval_minutes"
  | "daily_time"
  | "weekly"

/** Loose recurrence payload; execution engine interprets in a later phase. */
export type CommandScheduleRecurrence = {
  intervalMinutes?: number
  /** Local time HH:mm for daily_time */
  timeLocal?: string
  /** 0 = Sunday … 6 = Saturday for weekly */
  daysOfWeek?: number[]
}

export type OperatorCommandRunStatus =
  | "draft"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type CommandGroup = {
  id: string
  name: string
  description: string
  memberMeterIds: string[]
  createdAt: string
  updatedAt: string
}

export type CommandSchedule = {
  id: string
  name: string
  enabled: boolean
  actionType: OperatorActionType
  targetType: OperatorTargetType
  /** Populated when target is single or selected */
  meterIds: string[]
  /** Populated when target is saved_group */
  groupId: string | null
  cadenceType: CommandScheduleCadenceType
  recurrence: CommandScheduleRecurrence
  notes: string
  createdAt: string
  updatedAt: string
  /** Scheduler / execution metadata (Phase 2). */
  lastRunAt: string | null
  nextRunAt: string | null
  lastRunId: string | null
  lastOutcomeSummary: string
  lastSchedulerNote: string
}

export type OperatorRunSourceType = "manual" | "schedule"

export type OperatorCommandMeterResult = {
  meterId: string
  serialNumber: string
  state: "success" | "failed"
  summary: string
  finishedAt: string
  errorDetail?: string
}

export type OperatorCommandRun = {
  id: string
  sourceType: OperatorRunSourceType
  scheduleId: string | null
  actionType: OperatorActionType
  targetType: OperatorTargetType
  targetSummary: string
  meterIds: string[]
  /** Concrete meters executed (snapshot at queue time). */
  resolvedMeterIds: string[]
  groupId: string | null
  status: OperatorCommandRunStatus
  /** Future-safe read selection (e.g. catalog profile id). */
  readProfileMode?: string
  createdAt: string
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
  resultSummary: string
  errorSummary: string | null
  executionNote: string
  perMeterResults: OperatorCommandMeterResult[]
}

export type UnifiedCommandRunSource = "operator" | "legacy_catalog"

/** Table row merging operator runs with legacy jobs from commands.json. */
export type UnifiedCommandRunRow = {
  id: string
  source: UnifiedCommandRunSource
  /** Manual vs schedule for operator rows; null for legacy. */
  operatorTrigger: "manual" | "schedule" | null
  scheduleId: string | null
  actionType: string
  targetSummary: string
  status: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  resultSummary: string
  errorSummary: string | null
  notes: string | null
  /** e.g. "3/4 meters ok" for operator runs with per-meter data. */
  meterOutcomeBrief: string | null
}

export type CommandsOverviewStats = {
  groupsCount: number
  schedulesCount: number
  enabledSchedulesCount: number
  operatorRunsCount: number
  legacyCatalogCount: number
  executionRecordsTotal: number
  operatorQueued: number
  operatorRunning: number
  operatorFailed: number
  operatorCompletedLast24h: number
  legacyQueued: number
  legacyRunning: number
  legacyFailed: number
}
