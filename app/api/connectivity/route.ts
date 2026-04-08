import { buildConnectivityPhase1Response } from "@/lib/connectivity/phase1-aggregate"
import { buildPhase2HintsBySerial } from "@/lib/connectivity-events/phase2-hints"
import { syncConnectivityEventsFromListenerStatus } from "@/lib/connectivity-events/listener-snapshot"
import { readConnectivityEventsRaw, toPublicConnectivityEvent } from "@/lib/connectivity-events/store"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import {
  getTcpListenerStatusFromSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RECENT_EVENTS_CAP = 50
const HINTS_EVENT_SCAN = 2500

function eventsNewestFirst(
  events: import("@/types/connectivity-events").ConnectivityEventRecord[]
): import("@/types/connectivity-events").ConnectivityEventRecord[] {
  return [...events].sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1
    if (a.createdAt > b.createdAt) return -1
    return 0
  })
}

export async function GET() {
  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const meters = normalizeMeterRows(raw.parsed)
  if (meters.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_METERS_ROWS" }, { status: 500 })
  }

  let listenerStatus: Record<string, unknown> | null = null
  let listenerFetchFailed = false

  try {
    listenerStatus = (await getTcpListenerStatusFromSidecar()) as Record<
      string,
      unknown
    >
  } catch (e) {
    listenerFetchFailed = true
    if (
      e instanceof PythonSidecarNotConfiguredError ||
      e instanceof PythonSidecarHttpError
    ) {
      /* aggregate still returns per-meter unknown_live */
    }
  }

  if (listenerStatus && !listenerFetchFailed) {
    try {
      await syncConnectivityEventsFromListenerStatus(listenerStatus)
    } catch {
      /* non-fatal: live table still serves */
    }
  }

  const evRaw = await readConnectivityEventsRaw()
  const allEvents = evRaw.ok ? evRaw.events : []
  const newest = eventsNewestFirst(allEvents)
  const forHints = newest.slice(0, HINTS_EVENT_SCAN)
  const hintsBySerial = buildPhase2HintsBySerial(forHints)

  const core = buildConnectivityPhase1Response(
    meters,
    listenerStatus,
    listenerFetchFailed,
    hintsBySerial
  )

  const recentEvents = newest
    .slice(0, RECENT_EVENTS_CAP)
    .map((e) => toPublicConnectivityEvent(e))

  return NextResponse.json(
    {
      ...core,
      recentEvents,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  )
}
