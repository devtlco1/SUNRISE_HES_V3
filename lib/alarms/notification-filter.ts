import type {
  NotificationPreferences,
  OperationalAlarmRecord,
  OperationalAlarmSeverity,
  OperationalAlarmsSummary,
} from "@/types/operational-alarm"

function severityRank(s: OperationalAlarmSeverity): number {
  if (s === "critical") return 3
  if (s === "warning") return 2
  return 1
}

/**
 * Header notifications: active alarms that pass operator prefs.
 */
export function alarmPassesNotificationPrefs(
  alarm: OperationalAlarmRecord,
  prefs: NotificationPreferences
): boolean {
  if (alarm.status !== "active") return false
  if (prefs.criticalOnly && alarm.severity !== "critical") return false
  if (severityRank(alarm.severity) < severityRank(prefs.minimumSeverity)) {
    return false
  }

  const t = alarm.alarmType
  if (t === "connectivity_unstable" || t === "association_failed" || t === "identify_failed") {
    if (!prefs.enableConnectivityNotifications) return false
    return true
  }
  if (t === "relay_failure") {
    if (!prefs.enableRelayFailureNotifications) return false
    return true
  }
  if (t === "read_failure") {
    if (!prefs.enableReadFailureNotifications) return false
    return true
  }
  if (t === "command_run_failed" || t === "command_batch_partial") {
    if (!prefs.enableCommandFailureNotifications) return false
    return true
  }
  return true
}

export function notificationUnread(
  alarm: OperationalAlarmRecord,
  prefs: NotificationPreferences
): boolean {
  if (!alarmPassesNotificationPrefs(alarm, prefs)) return false
  if (prefs.dismissedNotificationIds.includes(alarm.id)) return false
  return true
}

export function computeOperationalSummary(
  alarms: OperationalAlarmRecord[],
  prefs: NotificationPreferences
): OperationalAlarmsSummary {
  const active = alarms.filter((a) => a.status === "active")
  const cleared = alarms.filter((a) => a.status === "cleared")
  const criticalActive = active.filter((a) => a.severity === "critical").length
  const suppressedNotificationCount = active.filter(
    (a) => !alarmPassesNotificationPrefs(a, prefs)
  ).length
  return {
    activeCount: active.length,
    clearedCount: cleared.length,
    criticalActiveCount: criticalActive,
    suppressedNotificationCount,
  }
}

/** Deep link from an alarm row to the most relevant operator page. */
export function operationalAlarmHref(a: OperationalAlarmRecord): string {
  if (a.sourceType === "commands") {
    return "/commands/run-now"
  }
  if (a.meterId && a.meterId.trim()) {
    return `/connectivity/meters/${encodeURIComponent(a.meterId.trim())}`
  }
  return "/connectivity/events"
}
