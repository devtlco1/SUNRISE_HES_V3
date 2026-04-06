import {
  postTcpListenerReadObisSelectionToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import type { ReadObisSelectionRequest } from "@/types/runtime"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isReadObisSelectionBody(v: unknown): v is ReadObisSelectionRequest {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (typeof o.meterId !== "string" || !o.meterId.trim()) return false
  if (!Array.isArray(o.selectedItems) || o.selectedItems.length === 0) return false
  for (const it of o.selectedItems) {
    if (it === null || typeof it !== "object" || Array.isArray(it)) return false
    const row = it as Record<string, unknown>
    if (typeof row.obis !== "string" || !row.obis.trim()) return false
    if (typeof row.objectType !== "string" || !row.objectType.trim()) return false
    if (typeof row.classId !== "number" || !Number.isFinite(row.classId)) return false
  }
  return true
}

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  if (!isReadObisSelectionBody(json)) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message:
          "Expected meterId and non-empty selectedItems with obis, objectType, classId per item.",
      },
      { status: 400 }
    )
  }

  try {
    const envelope = await postTcpListenerReadObisSelectionToPythonSidecar(json)
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
    const msg = e instanceof Error ? e.message : "READINGS_PROXY_ERROR"
    return NextResponse.json(
      { error: "READINGS_PROXY_ERROR", message: msg },
      { status: 500 }
    )
  }
}
