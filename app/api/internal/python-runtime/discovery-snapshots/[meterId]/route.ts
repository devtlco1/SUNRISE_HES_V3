import { getInternalApiToken } from "@/lib/runtime/ingress/config"
import { isValidMeterId } from "@/lib/runtime/contracts"
import {
  listDiscoverySnapshotsFromSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
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
 * Internal: list discovery snapshot entries for a meter (history + latest fallback).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ meterId: string }> }
) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { meterId } = await ctx.params
  if (!meterId || !isValidMeterId(meterId)) {
    return NextResponse.json({ error: "INVALID_METER_ID" }, { status: 400 })
  }

  try {
    const out = await listDiscoverySnapshotsFromSidecar(meterId.trim())
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
