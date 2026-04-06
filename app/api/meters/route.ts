import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import {
  createMeterRowFromSerial,
  serialAlreadyRegistered,
} from "@/lib/meters/create-from-serial"
import { normalizeMeterRow, normalizeMeterRows } from "@/lib/meters/normalize"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function metersPath(): string {
  return path.join(process.cwd(), "data", "meters.json")
}

export async function GET() {
  try {
    const filePath = metersPath()
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "INVALID_METERS_PAYLOAD" },
        { status: 500 }
      )
    }

    const rows = normalizeMeterRows(parsed)
    // Empty array [] → 200 with [] (valid empty catalog). 500 only when
    // the file was non-empty but no rows survived normalization.
    if (rows.length === 0 && parsed.length > 0) {
      return NextResponse.json(
        { error: "INVALID_METERS_ROWS" },
        { status: 500 }
      )
    }

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "METERS_LOAD_FAILED" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const serial =
    typeof o.serialNumber === "string" ? o.serialNumber.trim() : ""
  if (!serial) {
    return NextResponse.json({ error: "SERIAL_REQUIRED" }, { status: 400 })
  }

  const filePath = metersPath()
  let parsed: unknown
  try {
    const text = await readFile(filePath, "utf-8")
    parsed = JSON.parse(text) as unknown
  } catch {
    return NextResponse.json({ error: "METERS_LOAD_FAILED" }, { status: 500 })
  }
  if (!Array.isArray(parsed)) {
    return NextResponse.json({ error: "INVALID_METERS_PAYLOAD" }, { status: 500 })
  }

  const rows = normalizeMeterRows(parsed)
  if (serialAlreadyRegistered(serial, rows)) {
    return NextResponse.json(
      { error: "SERIAL_ALREADY_REGISTERED", serialNumber: serial },
      { status: 409 }
    )
  }

  const used = new Set(rows.map((r) => r.id))
  const newRow = createMeterRowFromSerial(serial, used)
  const normalized = normalizeMeterRow(newRow)
  if (!normalized) {
    return NextResponse.json({ error: "METER_ROW_INVALID" }, { status: 500 })
  }

  const next = [...parsed, normalized]

  try {
    const dir = path.dirname(filePath)
    await mkdir(dir, { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
  } catch {
    return NextResponse.json({ error: "METERS_WRITE_FAILED" }, { status: 500 })
  }

  return NextResponse.json(normalized, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  })
}
