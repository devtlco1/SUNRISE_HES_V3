import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type { OperationalAlarmSeverity } from "@/types/operational-alarm"

export function formatOperationalSeverity(s: OperationalAlarmSeverity): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<OperationalAlarmSeverity, string> = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
  }
  const variant: Record<OperationalAlarmSeverity, StatusBadgeVariant> = {
    critical: "danger",
    warning: "warning",
    info: "info",
  }
  return { variant: variant[s], label: labels[s] }
}

export function formatOperationalStatus(
  status: "active" | "cleared"
): { variant: StatusBadgeVariant; label: string } {
  if (status === "cleared") {
    return { variant: "success", label: "Cleared" }
  }
  return { variant: "warning", label: "Active" }
}
