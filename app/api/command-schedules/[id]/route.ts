import {
  readCommandSchedulesRaw,
  writeCommandSchedulesArray,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandSchedule,
  normalizeCommandSchedules,
} from "@/lib/commands/operator-normalize"
import { parseScheduleBody } from "@/lib/commands/parse-schedule-payload"
import { computeNextRunAt } from "@/lib/commands/schedule-next-run"
import { validateScheduleGroupRefs } from "@/lib/commands/validate-schedule-references"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeCommandSchedules(raw.parsed)
  const row = rows.find((r) => r.id === id)
  if (!row) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  return NextResponse.json(row, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const parsed = parseScheduleBody(o)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const v = await validateScheduleGroupRefs({
    meterGroupId: parsed.value.meterGroupId,
    obisCodeGroupId: parsed.value.obisCodeGroupId,
  })
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: v.status })
  }

  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeCommandSchedules(raw.parsed)
  const idx = existing.findIndex((r) => r.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const prev = existing[idx]!
  const now = new Date().toISOString()

  const merged = normalizeCommandSchedule({
    id: prev.id,
    name: parsed.value.name,
    enabled: parsed.value.enabled,
    scheduleType: parsed.value.scheduleType,
    intervalDays: parsed.value.intervalDays,
    startDate: parsed.value.startDate,
    endDate: parsed.value.endDate,
    startTime: parsed.value.startTime,
    endTime: parsed.value.endTime,
    runAtTime: parsed.value.runAtTime,
    notes: parsed.value.notes,
    meterGroupId: parsed.value.meterGroupId,
    obisCodeGroupId: parsed.value.obisCodeGroupId,
    createdAt: prev.createdAt,
    updatedAt: now,
    lastRunAt: prev.lastRunAt,
    lastRunId: prev.lastRunId,
    lastOutcomeSummary: prev.lastOutcomeSummary,
    lastSchedulerNote: prev.lastSchedulerNote,
    nextRunAt: prev.nextRunAt,
  })
  if (!merged) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_ROW" }, { status: 500 })
  }

  const nextRunAt = merged.enabled
    ? computeNextRunAt(merged, new Date()).toISOString()
    : null

  const row = normalizeCommandSchedule({
    ...merged,
    nextRunAt,
  })
  if (!row) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_ROW" }, { status: 500 })
  }

  const next = [...existing]
  next[idx] = row
  const w = await writeCommandSchedulesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(row)
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeCommandSchedules(raw.parsed)
  const next = existing.filter((r) => r.id !== id)
  if (next.length === existing.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const w = await writeCommandSchedulesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id })
}
