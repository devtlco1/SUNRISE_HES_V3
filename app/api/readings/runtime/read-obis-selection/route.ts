import {
  postReadObisSelectionToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import { normalizeReadObisSelectionBody } from "@/lib/readings/normalize-read-obis-body"
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

  const normalized = normalizeReadObisSelectionBody(json)
  if (!normalized) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message:
          "Expected meterId and selectedItems with obis, objectType, classId per item (classId may be coerced from string).",
      },
      { status: 400 }
    )
  }

  try {
    const envelope = await postReadObisSelectionToPythonSidecar(normalized)
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
      let detail: unknown
      try {
        detail = JSON.parse(e.bodyText) as unknown
      } catch {
        detail = undefined
      }
      return NextResponse.json(
        {
          error: "PYTHON_SIDECAR_HTTP_ERROR",
          status: e.status,
          message: e.message,
          pythonDetail: detail,
          bodyPreview: e.bodyText.slice(0, 2000),
        },
        { status: 502 }
      )
    }
    const msg = e instanceof Error ? e.message : "READINGS_PROXY_ERROR"
    return NextResponse.json(
      { error: "READINGS_PROXY_ERROR", message: msg },
      { status: 500 }
    )
  }
}
