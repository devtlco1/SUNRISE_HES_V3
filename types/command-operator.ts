/** Operator command workspace — meter groups, schedules, OBIS groups, runs. */

export type OperatorActionType = "read" | "relay_on" | "relay_off"

export type OperatorTargetType =
  | "single_meter"
  | "selected_meters"
  | "saved_group"

export type CommandScheduleType = "once" | "daily" | "every_n_days"

export type OperatorCommandRunStatus =
  | "draft"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

/** Saved meters for command targeting (unchanged persistence). */
export type CommandGroup = {
  id: string
  name: string
  description: string
  memberMeterIds: string[]
  createdAt: string
  updatedAt: string
}

/** Saved OBIS catalog object codes for read composition. */
export type ObisCodeGroup = {
  id: string
  name: string
  description: string
  /** PRM `object_code` values from canonical catalog. */
  objectCodes: string[]
  createdAt: string
  updatedAt: string
}

/**
 * Temporal schedule + defaults for automatic fires (meter + OBIS group).
 * Manual Run tab still picks all three explicitly.
 */
export type CommandSchedule = {
  id: string
  name: string
  enabled: boolean
  scheduleType: CommandScheduleType
  /** For `every_n_days` only. */
  intervalDays: number | null
  startDate: string | null
  endDate: string | null
  /** HH:mm local window start (optional). */
  startTime: string | null
  /** HH:mm local window end (optional). */
  endTime: string | null
  /** HH:mm anchor when the run should fire inside the window. */
  runAtTime: string | null
  notes: string
  /** Required for scheduler auto-runs. */
  meterGroupId: string | null
  obisCodeGroupId: string | null
  createdAt: string
  updatedAt: string
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
  resolvedMeterIds: string[]
  groupId: string | null
  meterGroupId: string | null
  obisCodeGroupId: string | null
  meterGroupName: string
  obisCodeGroupName: string
  scheduleName: string
  status: OperatorCommandRunStatus
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

export type UnifiedCommandRunRow = {
  id: string
  source: UnifiedCommandRunSource
  operatorTrigger: "manual" | "schedule" | null
  scheduleId: string | null
  meterGroupId: string | null
  obisCodeGroupId: string | null
  meterGroupName: string | null
  obisCodeGroupName: string | null
  scheduleName: string | null
  actionType: string
  targetSummary: string
  status: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  resultSummary: string
  errorSummary: string | null
  notes: string | null
  meterOutcomeBrief: string | null
}

/** Legacy overview API / stats helper (optional dashboard use). */
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
