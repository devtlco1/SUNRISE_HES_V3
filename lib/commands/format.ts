import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type {
  CommandQueueState,
  MeterCommandResultState,
} from "@/types/command"

export function formatQueueState(s: CommandQueueState): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<CommandQueueState, string> = {
    submitted: "Submitted",
    queued: "Queued",
    dispatching: "Dispatching",
    running: "Running",
    completed: "Completed",
    partial_failure: "Partial failure",
    failed: "Failed",
    cancelled: "Cancelled",
  }
  const variant: Record<CommandQueueState, StatusBadgeVariant> = {
    submitted: "neutral",
    queued: "info",
    dispatching: "info",
    running: "warning",
    completed: "success",
    partial_failure: "warning",
    failed: "danger",
    cancelled: "neutral",
  }
  return { variant: variant[s], label: labels[s] }
}

export function formatMeterCommandResult(s: MeterCommandResultState): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<MeterCommandResultState, string> = {
    pending: "Pending",
    queued: "Queued",
    running: "Running",
    success: "Success",
    failed: "Failed",
    timeout: "Timeout",
    rejected: "Rejected",
  }
  const variant: Record<MeterCommandResultState, StatusBadgeVariant> = {
    pending: "neutral",
    queued: "info",
    running: "warning",
    success: "success",
    failed: "danger",
    timeout: "danger",
    rejected: "warning",
  }
  return { variant: variant[s], label: labels[s] }
}

/** Coarse filter bucket for jobs table (UI-only). */
export type JobResultFilter =
  | "all"
  | "success_only"
  | "has_failures"
  | "in_progress"

export function jobMatchesResultFilter(
  row: {
    queueState: CommandQueueState
    failedCount: number
    pendingCount: number
  },
  f: JobResultFilter
): boolean {
  if (f === "all") return true
  if (f === "success_only")
    return (
      row.queueState === "completed" &&
      row.failedCount === 0 &&
      row.pendingCount === 0
    )
  if (f === "has_failures")
    return row.failedCount > 0 || row.queueState === "partial_failure"
  if (f === "in_progress")
    return (
      row.queueState === "submitted" ||
      row.queueState === "queued" ||
      row.queueState === "dispatching" ||
      row.queueState === "running"
    )
  return true
}
