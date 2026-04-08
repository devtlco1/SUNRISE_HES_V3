import {
  readObisCodeGroupsRaw,
  writeObisCodeGroupsArray,
} from "@/lib/commands/operator-file"
import { validateActionGroupShape } from "@/lib/commands/action-group-helpers"
import {
  normalizeCommandActionGroup,
  normalizeObisCodeGroups,
} from "@/lib/commands/operator-normalize"
import { readObisCatalog } from "@/lib/obis/catalog-store"
import type { CommandActionGroupMode } from "@/types/command-operator"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseActionMode(v: unknown): CommandActionGroupMode | null {
  if (v === "read_catalog" || v === "relay_on" || v === "relay_off") {
    return v
  }
  return null
}

async function validateObjectCodes(codes: string[]): Promise<
  | { ok: true }
  | { ok: false; error: string; unknownCodes?: string[] }
> {
  if (codes.length === 0) return { ok: true }
  const catalog = await readObisCatalog()
  const allowed = new Set(
    catalog.filter((e) => e.enabled).map((e) => e.object_code)
  )
  const bad = codes.filter((c) => !allowed.has(c))
  if (bad.length > 0) {
    return {
      ok: false,
      error: "UNKNOWN_OR_DISABLED_OBJECT_CODES",
      unknownCodes: bad,
    }
  }
  return { ok: true }
}

export async function GET() {
  const raw = await readObisCodeGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeObisCodeGroups(raw.parsed)
  if (rows.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_OBIS_GROUP_ROWS" }, { status: 500 })
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
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 })
  }
  const description =
    typeof o.description === "string" ? o.description.trim() : ""

  const actionMode = parseActionMode(o.actionMode)
  if (!actionMode) {
    return NextResponse.json({ error: "INVALID_ACTION_MODE" }, { status: 400 })
  }

  const objectCodes =
    actionMode === "read_catalog" && Array.isArray(o.objectCodes)
      ? o.objectCodes.filter(
          (x): x is string => typeof x === "string" && x.trim() !== ""
        )
      : []

  const shape = validateActionGroupShape({ actionMode, objectCodes })
  if (!shape.ok) {
    return NextResponse.json({ error: shape.error }, { status: 400 })
  }

  if (actionMode === "read_catalog") {
    const v = await validateObjectCodes(objectCodes)
    if (!v.ok) {
      return NextResponse.json(
        { error: v.error, ids: v.unknownCodes },
        { status: 400 }
      )
    }
  }

  const raw = await readObisCodeGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeObisCodeGroups(raw.parsed)
  const now = new Date().toISOString()
  const id = `ocg-${crypto.randomUUID()}`
  const row = normalizeCommandActionGroup({
    id,
    name,
    description,
    actionMode,
    objectCodes,
    createdAt: now,
    updatedAt: now,
  })
  if (!row) {
    return NextResponse.json({ error: "INVALID_ROW" }, { status: 500 })
  }
  const next = [...existing, row]
  const w = await writeObisCodeGroupsArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(row, { status: 201 })
}
