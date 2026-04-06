import { getInternalApiToken } from "@/lib/runtime/ingress/config"
import {
  getPythonReadJobFromSidecar,
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

const JOB_ID_PATTERN = /^[\w-]{1,128}$/

/**
 * Internal: poll read-job status / envelope result from the Python sidecar.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  if (!authorize(_req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { jobId } = await ctx.params
  if (!jobId || !JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "INVALID_JOB_ID" }, { status: 400 })
  }

  try {
    const out = await getPythonReadJobFromSidecar(jobId)
    return NextResponse.json(out, {
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
      if (e.status === 404) {
        return NextResponse.json(
          { error: "JOB_NOT_FOUND", message: e.message },
          { status: 404 }
        )
      }
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
