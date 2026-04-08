import { allocateConfigId } from "@/lib/configuration/config-id"
import {
  readMeterProfilesRaw,
  writeMeterProfilesArray,
} from "@/lib/configuration/meter-profiles-file"
import {
  normalizeMeterProfileRow,
  normalizeMeterProfileRows,
} from "@/lib/configuration/meter-profiles-normalize"
import type { MeterProfileRow } from "@/types/configuration"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const raw = await readMeterProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeMeterProfileRows(raw.parsed)
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const raw = await readMeterProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeMeterProfileRows(raw.parsed)
  const used = new Set(working.map((r) => r.id))
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 })
  }
  const id = allocateConfigId("mp", name, used)
  const candidate: MeterProfileRow = {
    id,
    name,
    manufacturer: typeof o.manufacturer === "string" ? o.manufacturer.trim() : "—",
    model: typeof o.model === "string" ? o.model.trim() : "—",
    firmware: typeof o.firmware === "string" ? o.firmware.trim() : "—",
    phaseType:
      o.phaseType === "single" || o.phaseType === "three_wye" || o.phaseType === "three_delta"
        ? o.phaseType
        : "single",
    defaultRelayStatus:
      o.defaultRelayStatus === "energized" ||
      o.defaultRelayStatus === "open" ||
      o.defaultRelayStatus === "unknown" ||
      o.defaultRelayStatus === "test"
        ? o.defaultRelayStatus
        : "unknown",
    defaultCommStatus:
      o.defaultCommStatus === "online" ||
      o.defaultCommStatus === "offline" ||
      o.defaultCommStatus === "degraded" ||
      o.defaultCommStatus === "dormant"
        ? o.defaultCommStatus
        : "offline",
    defaultTariffProfileId:
      typeof o.defaultTariffProfileId === "string" ? o.defaultTariffProfileId.trim() : "",
    notes: typeof o.notes === "string" ? o.notes.trim() : "",
    active: o.active !== false,
  }
  const normalized = normalizeMeterProfileRow(candidate)
  if (!normalized) {
    return NextResponse.json({ error: "ROW_INVALID" }, { status: 500 })
  }
  const next = [...working, normalized]
  const w = await writeMeterProfilesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(normalized, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PUT(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const id = typeof o.id === "string" ? o.id.trim() : ""
  if (!id) {
    return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 })
  }
  const raw = await readMeterProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeMeterProfileRows(raw.parsed)
  const idx = working.findIndex((r) => r.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const merged = { ...working[idx]!, ...o, id } as Record<string, unknown>
  const normalized = normalizeMeterProfileRow(merged)
  if (!normalized) {
    return NextResponse.json({ error: "ROW_INVALID" }, { status: 400 })
  }
  const next = [...working]
  next[idx] = normalized
  const w = await writeMeterProfilesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(normalized, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function DELETE(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const id = typeof o.id === "string" ? o.id.trim() : ""
  if (!id) {
    return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 })
  }
  const raw = await readMeterProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeMeterProfileRows(raw.parsed)
  const next = working.filter((r) => r.id !== id)
  if (next.length === working.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const w = await writeMeterProfilesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id }, {
    headers: { "Cache-Control": "no-store" },
  })
}
