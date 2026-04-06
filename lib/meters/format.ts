import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type {
  MeterAlarmState,
  MeterCommStatus,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"

export function formatCommStatus(s: MeterCommStatus): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<MeterCommStatus, string> = {
    online: "Online",
    offline: "Offline",
    degraded: "Degraded",
    dormant: "Dormant",
  }
  const variant: Record<MeterCommStatus, StatusBadgeVariant> = {
    online: "success",
    offline: "danger",
    degraded: "warning",
    dormant: "neutral",
  }
  return { variant: variant[s], label: labels[s] }
}

export function formatRelayStatus(s: MeterRelayStatus): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<MeterRelayStatus, string> = {
    energized: "Energized",
    open: "Open",
    unknown: "Unknown",
    test: "Test",
  }
  const variant: Record<MeterRelayStatus, StatusBadgeVariant> = {
    energized: "success",
    open: "warning",
    unknown: "neutral",
    test: "info",
  }
  return { variant: variant[s], label: labels[s] }
}

export function formatAlarmState(s: MeterAlarmState): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<MeterAlarmState, string> = {
    none: "None",
    warning: "Warning",
    critical: "Critical",
  }
  const variant: Record<MeterAlarmState, StatusBadgeVariant> = {
    none: "neutral",
    warning: "warning",
    critical: "danger",
  }
  return { variant: variant[s], label: labels[s] }
}

/** Compact phase label for dense tables. */
export function formatPhaseType(s: MeterPhaseType): string {
  const map: Record<MeterPhaseType, string> = {
    single: "1φ",
    three_wye: "3φ Y",
    three_delta: "3φ Δ",
  }
  return map[s]
}

/** Full phase label for detail panels. */
export function formatPhaseTypeLong(s: MeterPhaseType): string {
  const map: Record<MeterPhaseType, string> = {
    single: "Single-phase",
    three_wye: "Three-phase wye",
    three_delta: "Three-phase delta",
  }
  return map[s]
}
