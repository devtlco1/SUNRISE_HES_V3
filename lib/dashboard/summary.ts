import type { AlarmListRow, AlarmSeverity } from "@/types/alarm"
import type {
  ActivityItem,
  DashboardStat,
  RecentAlarmDigestRow,
  RecentCommandDigestRow,
} from "@/types/dashboard"
import type { CommandJobRow } from "@/types/command"
import type { MeterCommStatus, MeterListRow } from "@/types/meter"

const ACTIVITY_LIMIT = 8
const RECENT_ALARMS_LIMIT = 6
const RECENT_COMMANDS_LIMIT = 5

function isPendingCommandJob(job: CommandJobRow): boolean {
  const inFlight =
    job.queueState === "submitted" ||
    job.queueState === "queued" ||
    job.queueState === "dispatching" ||
    job.queueState === "running"
  return inFlight || job.pendingCount > 0
}

function isActiveAlarm(row: AlarmListRow): boolean {
  return row.state !== "cleared" && row.state !== "suppressed"
}

function alarmActivityTone(severity: AlarmSeverity): ActivityItem["tone"] {
  if (severity === "critical" || severity === "major" || severity === "warning") {
    return "warning"
  }
  if (severity === "minor") {
    return "warning"
  }
  return "neutral"
}

function connectivityActivityTone(comm: MeterCommStatus): ActivityItem["tone"] {
  if (comm === "offline" || comm === "degraded") return "warning"
  if (comm === "online") return "success"
  return "neutral"
}

function compareOccurredAt(a: string, b: string): number {
  if (a < b) return 1
  if (a > b) return -1
  return 0
}

/**
 * Derives dashboard KPIs, a merged activity feed, and a short alarm digest
 * from normalized catalog rows (same sources as the read-only domain APIs).
 */
export function buildDashboardSnapshot(
  meters: MeterListRow[],
  alarms: AlarmListRow[],
  commandJobs: CommandJobRow[]
): {
  stats: DashboardStat[]
  activity: ActivityItem[]
  recentAlarms: RecentAlarmDigestRow[]
  recentCommandJobs: RecentCommandDigestRow[]
} {
  const totalMeters = meters.length
  const onlineMeters = meters.filter((m) => m.commStatus === "online").length
  const activeAlarms = alarms.filter(isActiveAlarm).length
  const pendingCommands = commandJobs.filter(isPendingCommandJob).length

  const stats: DashboardStat[] = [
    {
      label: "Total Meters",
      value: totalMeters.toLocaleString(),
      description: "Rows in the meter registry catalog",
    },
    {
      label: "Online Meters",
      value: onlineMeters.toLocaleString(),
      description: "Comm status online in the meter catalog",
    },
    {
      label: "Pending Commands",
      value: pendingCommands.toLocaleString(),
      description:
        "Jobs queued, dispatching, running, submitted, or with pending meter work",
    },
    {
      label: "Active Alarms",
      value: activeAlarms.toLocaleString(),
      description: "Alarms not cleared or suppressed",
    },
  ]

  const activityCandidates: ActivityItem[] = []

  for (const a of alarms) {
    activityCandidates.push({
      id: `alm-${a.id}`,
      occurredAt: a.lastSeen,
      summary: `${a.severity} · ${a.alarmType} — ${a.customerName}`,
      tone: alarmActivityTone(a.severity),
    })
  }

  for (const m of meters) {
    const t = m.lastCommunicationAt?.trim()
    if (!t) continue
    activityCandidates.push({
      id: `meter-comm-${m.id}`,
      occurredAt: t,
      summary: `Registry comm ${m.commStatus} — ${m.serialNumber}`,
      tone: connectivityActivityTone(m.commStatus),
    })
  }

  const activity = [...activityCandidates]
    .sort((x, y) => compareOccurredAt(x.occurredAt, y.occurredAt))
    .slice(0, ACTIVITY_LIMIT)

  const recentAlarms: RecentAlarmDigestRow[] = [...alarms]
    .sort((a, b) => compareOccurredAt(a.lastSeen, b.lastSeen))
    .slice(0, RECENT_ALARMS_LIMIT)
    .map((a) => ({
      id: a.id,
      alarmType: a.alarmType,
      meterSerial: a.serialNumber,
      severity: a.severity,
      lastSeen: a.lastSeen,
    }))

  const recentCommandJobs: RecentCommandDigestRow[] = [...commandJobs]
    .sort((a, b) => compareOccurredAt(a.submittedAt, b.submittedAt))
    .slice(0, RECENT_COMMANDS_LIMIT)
    .map((j) => ({
      id: j.id,
      templateName: j.templateName,
      queueState: j.queueState,
      submittedAt: j.submittedAt,
      resultSummary: j.resultSummary,
    }))

  return { stats, activity, recentAlarms, recentCommandJobs }
}
