import type { AlarmSeverity } from "@/types/alarm"

export type DashboardStat = {
  label: string
  value: string
  description?: string
}

export type ActivityItem = {
  id: string
  occurredAt: string
  summary: string
  tone: "neutral" | "success" | "warning"
}

/** Compact row for the dashboard alarm digest table. */
export type RecentAlarmDigestRow = {
  id: string
  alarmType: string
  meterSerial: string
  severity: AlarmSeverity
  lastSeen: string
}

export type DashboardSnapshot = {
  stats: DashboardStat[]
  activity: ActivityItem[]
  recentAlarms: RecentAlarmDigestRow[]
}
