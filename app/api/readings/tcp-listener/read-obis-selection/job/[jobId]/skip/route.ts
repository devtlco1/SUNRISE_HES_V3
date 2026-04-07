import {
  postTcpListenerObisJobSkipToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { jsonResponseForPythonSidecarHttpError } from "@/lib/readings/python-sidecar-proxy-error"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const JOB_ID_PATTERN = /^[\w-]{1,128}$/

export async function POST(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await ctx.params
  if (!jobId || !JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "INVALID_JOB_ID" }, { status: 400 })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const idx =
    json && typeof json === "object" && "index" in json
      ? Number((json as { index: unknown }).index)
      : NaN
  if (!Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "INVALID_BODY", message: "Expected { index: number }." }, {
      status: 400,
    })
  }

  try {
    const out = await postTcpListenerObisJobSkipToPythonSidecar(jobId, idx)
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
      if (e.status === 400) {
        try {
          const parsed = JSON.parse(e.bodyText) as unknown
          return NextResponse.json(parsed, { status: 400 })
        } catch {
          return NextResponse.json(
            { ok: false, error: "SKIP_REJECTED", message: e.bodyText.slice(0, 500) },
            { status: 400 }
          )
        }
      }
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
