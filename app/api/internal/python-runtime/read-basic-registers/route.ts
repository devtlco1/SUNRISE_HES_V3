import { getInternalApiToken } from "@/lib/runtime/ingress/config"
import {
  postReadBasicRegistersToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { parsePythonReadBasicRegistersRequest } from "@/lib/runtime/python-sidecar/read-basic-registers-payload"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export const dynamic = "force-dynamic"

function authorize(req: Request): boolean {
  const tok = getInternalApiToken()
  if (!tok) return true
  const h = req.headers.get("authorization")
  return h === `Bearer ${tok}`
}

/**
 * Internal: proxy read-basic-registers to the Python protocol runtime sidecar.
 * Does not replace `POST /api/runtime/read-basic-registers` (TypeScript adapter).
 *
 * Requires `RUNTIME_PYTHON_SIDECAR_URL`. Optional `INTERNAL_API_TOKEN` + Bearer when set.
 */
export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

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
        message:
          "Expected meterId (and optional endpointId, channelHint, channel) per runtime contracts.",
      },
      { status: 400 }
    )
  }

  try {
    const envelope = await postReadBasicRegistersToPythonSidecar(parsed)
    return NextResponse.json(envelope, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    if (e instanceof PythonSidecarNotConfiguredError) {
      return NextResponse.json(
        {
          error: "PYTHON_SIDECAR_NOT_CONFIGURED",
          message: e.message,
        },
        { status: 503 }
      )
    }
    if (e instanceof PythonSidecarHttpError) {
      return NextResponse.json(
        {
          error: "PYTHON_SIDECAR_HTTP_ERROR",
          status: e.status,
          message: e.message,
          body: e.bodyText.slice(0, 2000),
        },
        { status: 502 }
      )
    }
    const msg = e instanceof Error ? e.message : "PROXY_INTERNAL_ERROR"
    return NextResponse.json(
      { error: "PROXY_INTERNAL_ERROR", message: msg },
      { status: 500 }
    )
  }
}
