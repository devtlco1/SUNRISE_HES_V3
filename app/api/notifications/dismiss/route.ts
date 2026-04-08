import { alarmPassesNotificationPrefs } from "@/lib/alarms/notification-filter"
import {
  mergePreferencePatch,
  readNotificationPreferences,
  writeNotificationPreferences,
} from "@/lib/alarms/notification-preferences-store"
import { syncOperationalAlarmsFromSources } from "@/lib/alarms/sync-operational-alarms"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })
  }
  const o = body as Record<string, unknown>
  const current = await readNotificationPreferences()
  let nextIds = [...current.dismissedNotificationIds]

  if (o.markAllMatching === true) {
    const sync = await syncOperationalAlarmsFromSources()
    if (!sync.ok) {
      return NextResponse.json({ error: sync.error }, { status: 500 })
    }
    const toAdd = sync.alarms
      .filter(
        (a) =>
          a.status === "active" && alarmPassesNotificationPrefs(a, current)
      )
      .map((a) => a.id)
    nextIds = [...new Set([...nextIds, ...toAdd])]
  }

  if (Array.isArray(o.alarmIds)) {
    const extra = o.alarmIds.filter((x): x is string => typeof x === "string")
    nextIds = [...new Set([...nextIds, ...extra])]
  }

  const merged = mergePreferencePatch(current, {
    dismissedNotificationIds: nextIds,
  })
  const w = await writeNotificationPreferences(merged)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, preferences: merged })
}
