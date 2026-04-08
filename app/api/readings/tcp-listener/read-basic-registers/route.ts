import { logConnectivityPythonProxyFailure } from "@/lib/connectivity-events/proxy-failure"
import { logConnectivityRuntimeEnvelope } from "@/lib/connectivity-events/runtime-envelope"
import { jsonResponseForPythonSidecarHttpError } from "@/lib/readings/python-sidecar-proxy-error"
import {
  postTcpListenerReadBasicRegistersToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { parsePythonReadBasicRegistersRequest } from "@/lib/runtime/python-sidecar/read-basic-registers-payload"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const parsed = parsePythonReadBasicRegistersRequest(json)
  if (!parsed) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message: "Expected meterId per runtime contracts.",
      },
      { status: 400 }
    )
  }

  try {
    const envelope = await postTcpListenerReadBasicRegistersToPythonSidecar(parsed)
    logConnectivityRuntimeEnvelope(envelope, { route: "inbound_tcp" })
    return NextResponse.json(envelope, {
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
      logConnectivityPythonProxyFailure(
        parsed.meterId,
        "readBasicRegisters",
        e,
        "inbound_tcp"
      )
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
