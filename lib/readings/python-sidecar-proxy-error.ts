import { NextResponse } from "next/server"

import { PythonSidecarHttpError } from "@/lib/runtime/python-sidecar/client"

/** Flatten FastAPI/Pydantic 422 `{ detail: [...] }` into a single operator-facing line. */
export function summarizeFastApiValidationDetail(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return ""
  const detail = (parsed as { detail?: unknown }).detail
  if (!Array.isArray(detail) || detail.length === 0) return ""
  const parts: string[] = []
  for (const item of detail) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const loc = Array.isArray(row.loc) ? row.loc.map(String).join(".") : ""
    const msg =
      typeof row.msg === "string"
        ? row.msg
        : typeof row.message === "string"
          ? row.message
          : ""
    if (loc && msg) parts.push(`${loc}: ${msg}`)
    else if (msg) parts.push(msg)
  }
  return parts.join("; ")
}

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

  if (e.status === 422) {
    const validationSummary = summarizeFastApiValidationDetail(pythonDetail)
    const message = validationSummary.trim() || e.message
    console.warn("[readings proxy] Python sidecar request validation failed (422)", {
      downstreamUrl: e.requestUrl,
      validationSummary: validationSummary || undefined,
    })
    return NextResponse.json(
      {
        error: "PYTHON_SIDECAR_VALIDATION_ERROR",
        message,
        pythonDetail,
        downstreamUrl: e.requestUrl ?? null,
        bodyPreview: e.bodyText.slice(0, 2000),
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    )
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
