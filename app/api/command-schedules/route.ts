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

export async function GET() {
  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeCommandSchedules(raw.parsed)
  if (rows.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_ROWS" }, { status: 500 })
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
  const now = new Date().toISOString()
  const id = `cs-${crypto.randomUUID()}`

  const draft = {
    id,
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
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    nextRunAt: null,
    lastRunId: null,
    lastOutcomeSummary: "",
    lastSchedulerNote: "",
  }

  const base = normalizeCommandSchedule(draft)
  if (!base) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_ROW" }, { status: 500 })
  }

  const nextRunAtIso = base.enabled
    ? computeNextRunAt(base, new Date()).toISOString()
    : null

  const rowWithNext = normalizeCommandSchedule({
    ...draft,
    nextRunAt: nextRunAtIso,
  })
  if (!rowWithNext) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_ROW" }, { status: 500 })
  }

  const next = [...existing, rowWithNext]
  const w = await writeCommandSchedulesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(rowWithNext, { status: 201 })
}
