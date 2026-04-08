import { allocateConfigId } from "@/lib/configuration/config-id"
import {
  readTariffProfilesRaw,
  writeTariffProfilesArray,
} from "@/lib/configuration/tariff-profiles-file"
import {
  normalizeTariffProfileRow,
  normalizeTariffProfileRows,
} from "@/lib/configuration/tariff-profiles-normalize"
import type { TariffProfileRow } from "@/types/configuration"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const raw = await readTariffProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeTariffProfileRows(raw.parsed)
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
  const raw = await readTariffProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeTariffProfileRows(raw.parsed)
  const used = new Set(working.map((r) => r.id))
  const name = typeof o.name === "string" ? o.name.trim() : ""
  const code = typeof o.code === "string" ? o.code.trim() : ""
  if (!name || !code) {
    return NextResponse.json({ error: "NAME_AND_CODE_REQUIRED" }, { status: 400 })
  }
  const id = allocateConfigId("tf", code, used)
  const candidate: TariffProfileRow = {
    id,
    name,
    code,
    description: typeof o.description === "string" ? o.description.trim() : "",
    active: o.active !== false,
    notes: typeof o.notes === "string" ? o.notes.trim() : "",
  }
  const normalized = normalizeTariffProfileRow(candidate)
  if (!normalized) {
    return NextResponse.json({ error: "ROW_INVALID" }, { status: 500 })
  }
  const next = [...working, normalized]
  const w = await writeTariffProfilesArray(next)
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
  const raw = await readTariffProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeTariffProfileRows(raw.parsed)
  const idx = working.findIndex((r) => r.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const merged = { ...working[idx]!, ...o, id } as Record<string, unknown>
  const normalized = normalizeTariffProfileRow(merged)
  if (!normalized) {
    return NextResponse.json({ error: "ROW_INVALID" }, { status: 400 })
  }
  const next = [...working]
  next[idx] = normalized
  const w = await writeTariffProfilesArray(next)
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
  const raw = await readTariffProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const working = normalizeTariffProfileRows(raw.parsed)
  const next = working.filter((r) => r.id !== id)
  if (next.length === working.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const w = await writeTariffProfilesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id }, {
    headers: { "Cache-Control": "no-store" },
  })
}
