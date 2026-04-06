import type { AlarmSeverity } from "@/types/alarm"
import type { CommandQueueState } from "@/types/command"

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

/** Compact row for the dashboard command jobs digest table. */
export type RecentCommandDigestRow = {
  id: string
  templateName: string
  queueState: CommandQueueState
  submittedAt: string
  resultSummary: string
}

export type DashboardSnapshot = {
  stats: DashboardStat[]
  activity: ActivityItem[]
  recentAlarms: RecentAlarmDigestRow[]
  recentCommandJobs: RecentCommandDigestRow[]
}
