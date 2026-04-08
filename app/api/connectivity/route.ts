import { buildConnectivityPhase1Response } from "@/lib/connectivity/phase1-aggregate"
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

  const payload = buildConnectivityPhase1Response(
    meters,
    listenerStatus,
    listenerFetchFailed
  )

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  })
}
