/** Operator command section — persisted definitions and run records (Phase 1). */

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
}

export type OperatorCommandRun = {
  id: string
  actionType: OperatorActionType
  targetType: OperatorTargetType
  targetSummary: string
  meterIds: string[]
  groupId: string | null
  status: OperatorCommandRunStatus
  /** Future-safe read selection (e.g. catalog profile id). */
  readProfileMode?: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  resultSummary: string
  errorSummary: string | null
  /** Honest operator/system note (e.g. Phase 1 recording-only). */
  executionNote: string
}

export type UnifiedCommandRunSource = "operator" | "legacy_catalog"

/** Table row merging operator runs with legacy jobs from commands.json. */
export type UnifiedCommandRunRow = {
  id: string
  source: UnifiedCommandRunSource
  actionType: string
  targetSummary: string
  status: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  resultSummary: string
  errorSummary: string | null
  notes: string | null
}

export type CommandsOverviewStats = {
  groupsCount: number
  schedulesCount: number
  operatorRunsCount: number
  legacyCatalogCount: number
  executionRecordsTotal: number
  operatorQueued: number
  operatorRunning: number
  operatorFailed: number
  legacyQueued: number
  legacyRunning: number
  legacyFailed: number
}
