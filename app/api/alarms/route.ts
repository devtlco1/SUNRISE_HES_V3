import { computeOperationalSummary } from "@/lib/alarms/notification-filter"
import { readNotificationPreferences } from "@/lib/alarms/notification-preferences-store"
import { syncOperationalAlarmsFromSources } from "@/lib/alarms/sync-operational-alarms"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const sync = await syncOperationalAlarmsFromSources()
  if (!sync.ok) {
    return NextResponse.json({ error: sync.error }, { status: 500 })
  }
  const preferences = await readNotificationPreferences()
  const summary = computeOperationalSummary(sync.alarms, preferences)
  return NextResponse.json(
    {
      alarms: sync.alarms,
      summary,
      preferences,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
