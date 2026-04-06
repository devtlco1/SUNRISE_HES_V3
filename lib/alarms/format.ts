import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type {
  AlarmAckState,
  AlarmLifecycleState,
  AlarmSeverity,
} from "@/types/alarm"

export function formatAlarmSeverity(s: AlarmSeverity): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<AlarmSeverity, string> = {
    critical: "Critical",
    major: "Major",
    minor: "Minor",
    warning: "Warning",
    info: "Info",
  }
  const variant: Record<AlarmSeverity, StatusBadgeVariant> = {
    critical: "danger",
    major: "danger",
    minor: "warning",
    warning: "warning",
    info: "info",
  }
  return { variant: variant[s], label: labels[s] }
}

export function formatAlarmState(s: AlarmLifecycleState): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<AlarmLifecycleState, string> = {
    open: "Open",
    acknowledged: "Acknowledged",
    in_progress: "In progress",
    cleared: "Cleared",
    suppressed: "Suppressed",
  }
  const variant: Record<AlarmLifecycleState, StatusBadgeVariant> = {
    open: "warning",
    acknowledged: "neutral",
    in_progress: "info",
    cleared: "success",
    suppressed: "neutral",
  }
  return { variant: variant[s], label: labels[s] }
}

export function formatAlarmAck(s: AlarmAckState): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<AlarmAckState, string> = {
    unacknowledged: "Unacknowledged",
    acknowledged: "Acknowledged",
    assigned: "Assigned",
  }
  const variant: Record<AlarmAckState, StatusBadgeVariant> = {
    unacknowledged: "danger",
    acknowledged: "success",
    assigned: "info",
  }
  return { variant: variant[s], label: labels[s] }
}
