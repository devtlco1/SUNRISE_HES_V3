import { NextResponse } from "next/server"

import { PythonSidecarHttpError } from "@/lib/runtime/python-sidecar/client"

const ROUTE_NOT_FOUND_HINT =
  "The Python sidecar has no HTTP handler for this URL. Restart the sidecar after deploying new code. Set RUNTIME_PYTHON_SIDECAR_URL to the server root only (e.g. http://127.0.0.1:8011), not including /v1 or /v1/runtime."

/**
 * Maps Python sidecar failures to a JSON body for readings read-obis-selection API routes.
 * HTTP 404 from FastAPI almost always means a doubled base URL or a stale sidecar binary.
 */
export function jsonResponseForPythonSidecarHttpError(
  e: PythonSidecarHttpError,
  options?: { mapStatus404ToRouteMissing?: boolean }
): NextResponse {
  let pythonDetail: unknown
  try {
    pythonDetail = JSON.parse(e.bodyText) as unknown
  } catch {
    pythonDetail = undefined
  }

  if (e.status === 409) {
    const body =
      pythonDetail && typeof pythonDetail === "object"
        ? pythonDetail
        : { error: "SESSION_BUSY", message: e.message }
    return NextResponse.json(body, { status: 409, headers: { "Cache-Control": "no-store" } })
  }

  const shared = {
    status: e.status,
    message: e.message,
    pythonDetail,
    bodyPreview: e.bodyText.slice(0, 2000),
    downstreamUrl: e.requestUrl ?? null,
  }

  if (options?.mapStatus404ToRouteMissing && e.status === 404) {
    console.warn("[readings proxy] Python sidecar returned 404 for read-obis-selection", {
      downstreamUrl: e.requestUrl,
    })
    return NextResponse.json(
      {
        ...shared,
        error: "PYTHON_SIDECAR_ROUTE_NOT_FOUND",
        hint: ROUTE_NOT_FOUND_HINT,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  return NextResponse.json(
    {
      ...shared,
      error: "PYTHON_SIDECAR_HTTP_ERROR",
    },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  )
}
