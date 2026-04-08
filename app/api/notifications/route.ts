import {
  alarmPassesNotificationPrefs,
  notificationUnread,
  operationalAlarmHref,
} from "@/lib/alarms/notification-filter"
import { readNotificationPreferences } from "@/lib/alarms/notification-preferences-store"
import { syncOperationalAlarmsFromSources } from "@/lib/alarms/sync-operational-alarms"
import type { OperationalAlarmRecord } from "@/types/operational-alarm"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type NotificationFeedItem = {
  id: string
  title: string
  message: string
  severity: OperationalAlarmRecord["severity"]
  sourceType: OperationalAlarmRecord["sourceType"]
  alarmType: string
  status: OperationalAlarmRecord["status"]
  createdAt: string
  href: string
  unread: boolean
}

export async function GET() {
  const sync = await syncOperationalAlarmsFromSources()
  if (!sync.ok) {
    return NextResponse.json({ error: sync.error }, { status: 500 })
  }
  const preferences = await readNotificationPreferences()
  const active = sync.alarms.filter((a) => a.status === "active")
  const visible = active
    .filter((a) => alarmPassesNotificationPrefs(a, preferences))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 25)

  const items: NotificationFeedItem[] = visible.map((a) => ({
    id: a.id,
    title: a.title,
    message: a.message.slice(0, 240),
    severity: a.severity,
    sourceType: a.sourceType,
    alarmType: a.alarmType,
    status: a.status,
    createdAt: a.createdAt,
    href: operationalAlarmHref(a),
    unread: notificationUnread(a, preferences),
  }))

  const unreadCount = visible.filter((a) =>
    notificationUnread(a, preferences)
  ).length

  return NextResponse.json(
    { items, unreadCount },
    { headers: { "Cache-Control": "no-store" } }
  )
}
