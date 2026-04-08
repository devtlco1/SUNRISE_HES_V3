import { readConnectivityEventsRaw, toPublicConnectivityEvent } from "@/lib/connectivity-events/store"
import { CONNECTIVITY_FAILURE_EVENT_TYPES } from "@/types/connectivity-events"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function newestFirst(
  events: import("@/types/connectivity-events").ConnectivityEventRecord[]
) {
  return [...events].sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1
    if (a.createdAt > b.createdAt) return -1
    return 0
  })
}

export async function GET(req: Request) {
  const raw = await readConnectivityEventsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }

  const url = new URL(req.url)
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50)
  )
  const failuresOnly = url.searchParams.get("failuresOnly") === "1"
  const serialQ = (url.searchParams.get("serial") ?? "").trim().toLowerCase()

  let list = newestFirst(raw.events)
  if (failuresOnly) {
    list = list.filter((e) => CONNECTIVITY_FAILURE_EVENT_TYPES.has(e.eventType))
  }
  if (serialQ) {
    list = list.filter((e) =>
      e.meterSerial.trim().toLowerCase().includes(serialQ)
    )
  }

  const events = list.slice(0, limit).map((e) => toPublicConnectivityEvent(e))

  return NextResponse.json(
    { events, totalAvailable: raw.events.length },
    { headers: { "Cache-Control": "no-store" } }
  )
}
