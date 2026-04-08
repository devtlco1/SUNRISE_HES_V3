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

export async function GET() {
  const raw = await readCommandGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeCommandGroups(raw.parsed)
  if (rows.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_GROUP_ROWS" }, { status: 500 })
  }
  return NextResponse.json(rows, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("commands.groups.manage")
  if (!gate.ok) return gate.response
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
  const badIds = memberMeterIds.filter((id) => !allowed.has(id))
  if (badIds.length > 0) {
    return NextResponse.json(
      { error: "UNKNOWN_METER_IDS", ids: badIds },
      { status: 400 }
    )
  }

  const raw = await readCommandGroupsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeCommandGroups(raw.parsed)
  const now = new Date().toISOString()
  const id = `cg-${crypto.randomUUID()}`
  const row = normalizeCommandGroup({
    id,
    name,
    description,
    memberMeterIds,
    createdAt: now,
    updatedAt: now,
  })
  if (!row) {
    return NextResponse.json({ error: "INVALID_GROUP_ROW" }, { status: 500 })
  }
  const next = [...existing, row]
  const w = await writeCommandGroupsArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(row, { status: 201 })
}
