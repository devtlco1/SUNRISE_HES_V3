import {
  readCommandGroupsRaw,
  writeCommandGroupsArray,
} from "@/lib/commands/operator-file"
import { requireApiPermission } from "@/lib/rbac/require-api-permission"
import {
  normalizeCommandGroup,
  normalizeCommandGroups,
} from "@/lib/commands/operator-normalize"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const raw = await readCommandGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeCommandGroups(raw.parsed)
  const row = rows.find((r) => r.id === id)
  if (!row) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  return NextResponse.json(row, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PUT(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("commands.groups.manage")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
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
  const memberMeterIds = Array.isArray(o.memberMeterIds)
    ? o.memberMeterIds.filter(
        (x): x is string => typeof x === "string" && x.trim() !== ""
      )
    : []

  const metersRaw = await readMetersJsonRaw()
  if (!metersRaw.ok) {
    return NextResponse.json({ error: metersRaw.error }, { status: 500 })
  }
  const meters = normalizeMeterRows(metersRaw.parsed)
  const allowed = new Set(meters.map((m) => m.id))
  const bad = memberMeterIds.filter((mid) => !allowed.has(mid))
  if (bad.length > 0) {
    return NextResponse.json(
      { error: "UNKNOWN_METER_IDS", ids: bad },
      { status: 400 }
    )
  }

  const raw = await readCommandGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeCommandGroups(raw.parsed)
  const idx = existing.findIndex((r) => r.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const prev = existing[idx]!
  const now = new Date().toISOString()
  const row = normalizeCommandGroup({
    ...prev,
    name,
    description,
    memberMeterIds,
    updatedAt: now,
  })
  if (!row) {
    return NextResponse.json({ error: "INVALID_GROUP_ROW" }, { status: 500 })
  }
  const next = [...existing]
  next[idx] = row
  const w = await writeCommandGroupsArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(row)
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("commands.groups.manage")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const raw = await readCommandGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeCommandGroups(raw.parsed)
  const next = existing.filter((r) => r.id !== id)
  if (next.length === existing.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const w = await writeCommandGroupsArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id })
}
