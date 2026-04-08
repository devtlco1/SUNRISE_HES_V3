import {
  mergePreferencePatch,
  readNotificationPreferences,
  writeNotificationPreferences,
} from "@/lib/alarms/notification-preferences-store"
import type { NotificationPreferences } from "@/types/operational-alarm"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isSeverity(v: unknown): v is NotificationPreferences["minimumSeverity"] {
  return v === "info" || v === "warning" || v === "critical"
}

export async function GET() {
  const preferences = await readNotificationPreferences()
  return NextResponse.json(preferences, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PUT(req: Request) {
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
  const patch: Partial<NotificationPreferences> = {}
  if (typeof o.enableConnectivityNotifications === "boolean") {
    patch.enableConnectivityNotifications = o.enableConnectivityNotifications
  }
  if (typeof o.enableCommandFailureNotifications === "boolean") {
    patch.enableCommandFailureNotifications = o.enableCommandFailureNotifications
  }
  if (typeof o.enableRelayFailureNotifications === "boolean") {
    patch.enableRelayFailureNotifications = o.enableRelayFailureNotifications
  }
  if (typeof o.enableReadFailureNotifications === "boolean") {
    patch.enableReadFailureNotifications = o.enableReadFailureNotifications
  }
  if (typeof o.criticalOnly === "boolean") {
    patch.criticalOnly = o.criticalOnly
  }
  if (isSeverity(o.minimumSeverity)) {
    patch.minimumSeverity = o.minimumSeverity
  }
  const merged = mergePreferencePatch(current, patch)
  const w = await writeNotificationPreferences(merged)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(merged)
}
