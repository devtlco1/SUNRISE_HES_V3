import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type { ConnectivityHealthState } from "@/types/connectivity"

export function formatHealthState(s: ConnectivityHealthState): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<ConnectivityHealthState, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    failed: "Failed",
    unknown: "Unknown",
  }
  const variant: Record<ConnectivityHealthState, StatusBadgeVariant> = {
    healthy: "success",
    degraded: "warning",
    failed: "danger",
    unknown: "neutral",
  }
  return { variant: variant[s], label: labels[s] }
}
