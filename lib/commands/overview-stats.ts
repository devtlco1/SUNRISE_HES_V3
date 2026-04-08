import type { CommandJobRow, CommandQueueState } from "@/types/command"
import type {
  CommandSchedule,
  CommandsOverviewStats,
  OperatorCommandRun,
} from "@/types/command-operator"

const LEGACY_QUEUED: CommandQueueState[] = [
  "submitted",
  "queued",
  "dispatching",
  "running",
]

const DAY_MS = 24 * 60 * 60 * 1000

function legacyQueuedRunningFailed(rows: CommandJobRow[]) {
  let queued = 0
  let running = 0
  let failed = 0
  for (const r of rows) {
    if (r.queueState === "running") running += 1
    else if (LEGACY_QUEUED.includes(r.queueState)) queued += 1
    if (r.queueState === "failed" || r.queueState === "partial_failure")
      failed += 1
  }
  return { queued, running, failed }
}

function operatorExecutionStats(rows: OperatorCommandRun[]) {
  const now = Date.now()
  let queued = 0
  let running = 0
  let failed = 0
  let completedLast24h = 0
  for (const r of rows) {
    if (r.status === "queued" || r.status === "draft") queued += 1
    if (r.status === "running") running += 1
    if (r.status === "failed") failed += 1
    if (r.status === "completed" && r.finishedAt) {
      const t = Date.parse(r.finishedAt)
      if (Number.isFinite(t) && now - t < DAY_MS) {
        completedLast24h += 1
      }
    }
  }
  return { queued, running, failed, completedLast24h }
}

export function buildCommandsOverviewStats(input: {
  groupsCount: number
  schedules: CommandSchedule[]
  operatorRuns: OperatorCommandRun[]
  legacyJobs: CommandJobRow[]
}): CommandsOverviewStats {
  const op = operatorExecutionStats(input.operatorRuns)
  const leg = legacyQueuedRunningFailed(input.legacyJobs)
  const operatorRunsCount = input.operatorRuns.length
  const legacyCatalogCount = input.legacyJobs.length
  const enabledSchedulesCount = input.schedules.filter((s) => s.enabled).length
  return {
    groupsCount: input.groupsCount,
    schedulesCount: input.schedules.length,
    enabledSchedulesCount,
    operatorRunsCount,
    legacyCatalogCount,
    executionRecordsTotal: operatorRunsCount + legacyCatalogCount,
    operatorQueued: op.queued,
    operatorRunning: op.running,
    operatorFailed: op.failed,
    operatorCompletedLast24h: op.completedLast24h,
    legacyQueued: leg.queued,
    legacyRunning: leg.running,
    legacyFailed: leg.failed,
  }
}
