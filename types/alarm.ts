export type AlarmSeverity = "critical" | "major" | "minor" | "warning" | "info"

export type AlarmLifecycleState =
  | "open"
  | "acknowledged"
  | "in_progress"
  | "cleared"
  | "suppressed"

export type AlarmAckState = "unacknowledged" | "acknowledged" | "assigned"

export type AlarmListRow = {
  id: string
  meterId: string
  serialNumber: string
  customerName: string
  feeder: string
  transformer: string
  zone: string
  alarmType: string
  severity: AlarmSeverity
  state: AlarmLifecycleState
  sourceDomain: string
  firstSeen: string
  lastSeen: string
  occurrenceCount: number
  ackState: AlarmAckState
  assignedTo: string | null
  summary: string
}
