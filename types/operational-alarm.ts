/**
 * Persisted operational alarms — higher-level conditions derived from real signals.
 * Distinct from raw connectivity event rows.
 */

export type OperationalAlarmSourceType =
  | "connectivity"
  | "commands"
  | "reading"
  | "relay"
  | "runtime"

export type OperationalAlarmSeverity = "info" | "warning" | "critical"

export type OperationalAlarmStatus = "active" | "cleared"

export type OperationalAlarmRecord = {
  id: string
  sourceType: OperationalAlarmSourceType
  /** Correlation id when available (run id, event id, etc.). */
  sourceId: string | null
  meterId: string | null
  meterSerial: string | null
  severity: OperationalAlarmSeverity
  alarmType: string
  title: string
  message: string
  status: OperationalAlarmStatus
  createdAt: string
  updatedAt: string
  clearedAt: string | null
  metadata?: Record<string, unknown>
}

/** Operator notification / header preferences (single shared store for phase 1). */
export type NotificationPreferences = {
  enableConnectivityNotifications: boolean
  enableCommandFailureNotifications: boolean
  enableRelayFailureNotifications: boolean
  enableReadFailureNotifications: boolean
  /** When true, only `critical` severity passes the header filter. */
  criticalOnly: boolean
  /** Minimum severity to show in header (info = all that pass toggles). */
  minimumSeverity: OperationalAlarmSeverity
  /**
   * Alarm ids dismissed from the header list (still visible on /alarms).
   * Capped on write to avoid unbounded growth.
   */
  dismissedNotificationIds: string[]
  updatedAt: string
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enableConnectivityNotifications: true,
  enableCommandFailureNotifications: true,
  enableRelayFailureNotifications: true,
  enableReadFailureNotifications: true,
  criticalOnly: false,
  minimumSeverity: "info",
  dismissedNotificationIds: [],
  updatedAt: new Date(0).toISOString(),
}

export type OperationalAlarmsSummary = {
  activeCount: number
  clearedCount: number
  criticalActiveCount: number
  /** Active alarms hidden from header by prefs (still on page). */
  suppressedNotificationCount: number
}

export type OperationalAlarmsApiResponse = {
  alarms: OperationalAlarmRecord[]
  summary: OperationalAlarmsSummary
  preferences: NotificationPreferences
}
