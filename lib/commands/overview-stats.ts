import type { CommandJobRow, CommandQueueState } from "@/types/command"
import type {
  CommandsOverviewStats,
  OperatorCommandRun,
} from "@/types/command-operator"

const LEGACY_QUEUED: CommandQueueState[] = [
  "submitted",
  "queued",
  "dispatching",
  "running",
]

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

function operatorQueuedRunningFailed(rows: OperatorCommandRun[]) {
  let queued = 0
  let running = 0
  let failed = 0
  for (const r of rows) {
    if (r.status === "queued" || r.status === "draft") queued += 1
    if (r.status === "running") running += 1
    if (r.status === "failed") failed += 1
  }
  return { queued, running, failed }
}

export function buildCommandsOverviewStats(input: {
  groupsCount: number
  schedulesCount: number
  operatorRuns: OperatorCommandRun[]
  legacyJobs: CommandJobRow[]
}): CommandsOverviewStats {
  const op = operatorQueuedRunningFailed(input.operatorRuns)
  const leg = legacyQueuedRunningFailed(input.legacyJobs)
  const operatorRunsCount = input.operatorRuns.length
  const legacyCatalogCount = input.legacyJobs.length
  return {
    groupsCount: input.groupsCount,
    schedulesCount: input.schedulesCount,
    operatorRunsCount,
    legacyCatalogCount,
    executionRecordsTotal: operatorRunsCount + legacyCatalogCount,
    operatorQueued: op.queued,
    operatorRunning: op.running,
    operatorFailed: op.failed,
    legacyQueued: leg.queued,
    legacyRunning: leg.running,
    legacyFailed: leg.failed,
  }
}
