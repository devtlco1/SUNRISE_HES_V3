import type { AlarmListRow, AlarmSeverity } from "@/types/alarm"
import type {
  ActivityItem,
  DashboardStat,
  RecentAlarmDigestRow,
} from "@/types/dashboard"
import type { ConnectivityListRow } from "@/types/connectivity"
import type { MeterCommStatus, MeterListRow } from "@/types/meter"

const ACTIVITY_LIMIT = 8
const RECENT_ALARMS_LIMIT = 6

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
 * from normalized catalog rows (same sources as /api/meters, /api/connectivity, /api/alarms).
 */
export function buildDashboardSnapshot(
  meters: MeterListRow[],
  connectivity: ConnectivityListRow[],
  alarms: AlarmListRow[]
): {
  stats: DashboardStat[]
  activity: ActivityItem[]
  recentAlarms: RecentAlarmDigestRow[]
} {
  const totalMeters = meters.length
  const onlineMeters = meters.filter((m) => m.commStatus === "online").length
  const activeAlarms = alarms.filter(isActiveAlarm).length

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
      value: "—",
      description: "Placeholder — command jobs API not integrated yet",
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

  for (const c of connectivity) {
    activityCandidates.push({
      id: `conn-${c.id}`,
      occurredAt: c.lastCommunicationAt,
      summary: `Comm ${c.commState} — ${c.serialNumber} · ${c.networkType}`,
      tone: connectivityActivityTone(c.commState),
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

  return { stats, activity, recentAlarms }
}
