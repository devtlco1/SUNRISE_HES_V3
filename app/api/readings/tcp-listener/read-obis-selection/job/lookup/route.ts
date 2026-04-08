import {
  getTcpListenerObisSelectionJobLookupFromPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { jsonResponseForPythonSidecarHttpError } from "@/lib/readings/python-sidecar-proxy-error"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const METER_ID_MAX = 256

export async function GET(req: Request) {
  const url = new URL(req.url)
  const meterId = (url.searchParams.get("meterId") ?? "").trim()
  if (!meterId || meterId.length > METER_ID_MAX) {
    return NextResponse.json({ error: "INVALID_METER_ID" }, { status: 400 })
  }

  try {
    const out = await getTcpListenerObisSelectionJobLookupFromPythonSidecar(meterId)
    return NextResponse.json(out, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    if (e instanceof PythonSidecarNotConfiguredError) {
      return NextResponse.json(
        { error: "PYTHON_SIDECAR_NOT_CONFIGURED", message: e.message },
        { status: 503 }
      )
    }
    if (e instanceof PythonSidecarHttpError) {
      return jsonResponseForPythonSidecarHttpError(e, {
        mapStatus404ToRouteMissing: true,
      })
    }
    const msg = e instanceof Error ? e.message : "READINGS_PROXY_ERROR"
    return NextResponse.json(
      { error: "READINGS_PROXY_ERROR", message: msg },
      { status: 500 }
    )
  }
}
