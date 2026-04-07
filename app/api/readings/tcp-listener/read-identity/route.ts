import { jsonResponseForPythonSidecarHttpError } from "@/lib/readings/python-sidecar-proxy-error"
import {
  postTcpListenerReadIdentityToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { parsePythonReadIdentityRequest } from "@/lib/runtime/python-sidecar/read-identity-payload"
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

  const parsed = parsePythonReadIdentityRequest(json)
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
    const envelope = await postTcpListenerReadIdentityToPythonSidecar(parsed)
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
