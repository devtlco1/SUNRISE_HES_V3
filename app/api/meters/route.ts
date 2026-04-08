import { coerceMeterRow } from "@/lib/meters/coerce"
import {
  createMeterRowFromSerial,
  serialAlreadyRegistered,
} from "@/lib/meters/create-from-serial"
import {
  readMetersJsonRaw,
  writeMetersJsonArray,
} from "@/lib/meters/meters-file"
import { normalizeMeterRow, normalizeMeterRows } from "@/lib/meters/normalize"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeMeterRows(raw.parsed)
  if (rows.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_METERS_ROWS" }, { status: 500 })
  }
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

  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeMeterRows(raw.parsed)
  if (working.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_METERS_PAYLOAD" }, { status: 500 })
  }

  const keys = Object.keys(o).filter(
    (k) => o[k] !== undefined && o[k] !== null && o[k] !== ""
  )
  const legacyOnlySerial =
    keys.length === 1 && keys[0] === "serialNumber" && typeof o.serialNumber === "string"

  if (legacyOnlySerial) {
    const serial = String(o.serialNumber).trim()
    if (!serial) {
      return NextResponse.json({ error: "SERIAL_REQUIRED" }, { status: 400 })
    }
    if (serialAlreadyRegistered(serial, working)) {
      return NextResponse.json(
        { error: "SERIAL_ALREADY_REGISTERED", serialNumber: serial },
        { status: 409 }
      )
    }
    const used = new Set(working.map((r) => r.id))
    const newRow = createMeterRowFromSerial(serial, used)
    const normalized = normalizeMeterRow(newRow)
    if (!normalized) {
      return NextResponse.json({ error: "METER_ROW_INVALID" }, { status: 500 })
    }
    const next = [...working, normalized]
    const w = await writeMetersJsonArray(next)
    if (!w.ok) {
      return NextResponse.json({ error: w.error }, { status: 500 })
    }
    return NextResponse.json(normalized, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    })
  }

  const used = new Set(working.map((r) => r.id))
  const coerced = coerceMeterRow(o, { usedIds: used })
  if (!coerced) {
    return NextResponse.json({ error: "METER_ROW_INVALID" }, { status: 400 })
  }
  if (serialAlreadyRegistered(coerced.serialNumber, working)) {
    return NextResponse.json(
      { error: "SERIAL_ALREADY_REGISTERED", serialNumber: coerced.serialNumber },
      { status: 409 }
    )
  }
  const normalized = normalizeMeterRow(coerced)
  if (!normalized) {
    return NextResponse.json({ error: "METER_ROW_INVALID" }, { status: 500 })
  }
  if (working.some((r) => r.id === normalized.id)) {
    return NextResponse.json(
      { error: "ID_ALREADY_REGISTERED", id: normalized.id },
      { status: 409 }
    )
  }
  const next = [...working, normalized]
  const w = await writeMetersJsonArray(next)
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

  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeMeterRows(raw.parsed)
  if (working.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_METERS_PAYLOAD" }, { status: 500 })
  }

  const id = typeof o.id === "string" ? o.id.trim() : ""
  const serial = typeof o.serialNumber === "string" ? o.serialNumber.trim() : ""
  let idx = id ? working.findIndex((r) => r.id === id) : -1
  if (idx < 0 && serial) {
    idx = working.findIndex(
      (r) => r.serialNumber.trim().toLowerCase() === serial.toLowerCase()
    )
  }
  if (idx < 0) {
    return NextResponse.json({ error: "METER_NOT_FOUND" }, { status: 404 })
  }

  const existing = working[idx]!
  const used = new Set(working.map((r) => r.id))
  used.delete(existing.id)

  const coerced = coerceMeterRow(
    { ...o, id: existing.id },
    { usedIds: used }
  )
  if (!coerced) {
    return NextResponse.json({ error: "METER_ROW_INVALID" }, { status: 400 })
  }

  const nextSerial = coerced.serialNumber.trim()
  const serialClash = working.some(
    (r, i) =>
      i !== idx &&
      r.serialNumber.trim().toLowerCase() === nextSerial.toLowerCase()
  )
  if (serialClash) {
    return NextResponse.json(
      { error: "SERIAL_ALREADY_REGISTERED", serialNumber: nextSerial },
      { status: 409 }
    )
  }

  const finalRow = { ...coerced, id: existing.id }
  const normalized = normalizeMeterRow(finalRow)
  if (!normalized) {
    return NextResponse.json({ error: "METER_ROW_INVALID" }, { status: 500 })
  }

  const next = [...working]
  next[idx] = normalized
  const w = await writeMetersJsonArray(next)
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
  const serial = typeof o.serialNumber === "string" ? o.serialNumber.trim() : ""
  if (!id && !serial) {
    return NextResponse.json({ error: "ID_OR_SERIAL_REQUIRED" }, { status: 400 })
  }

  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeMeterRows(raw.parsed)
  const idx = id
    ? working.findIndex((r) => r.id === id)
    : working.findIndex(
        (r) => r.serialNumber.trim().toLowerCase() === serial.toLowerCase()
      )
  if (idx < 0) {
    return NextResponse.json({ error: "METER_NOT_FOUND" }, { status: 404 })
  }
  const victim = working[idx]!
  const next = working.filter((_, i) => i !== idx)

  const w = await writeMetersJsonArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(
    { ok: true, id: victim.id },
    { headers: { "Cache-Control": "no-store" } }
  )
}
