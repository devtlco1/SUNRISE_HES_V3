import {
  readCommandGroupsRaw,
  readCommandSchedulesRaw,
  writeCommandSchedulesArray,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandGroups,
  normalizeCommandSchedule,
  normalizeCommandSchedules,
} from "@/lib/commands/operator-normalize"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import type {
  CommandScheduleCadenceType,
  CommandScheduleRecurrence,
  OperatorActionType,
  OperatorTargetType,
} from "@/types/command-operator"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ACTIONS: readonly OperatorActionType[] = ["read", "relay_on", "relay_off"]
const TARGETS: readonly OperatorTargetType[] = [
  "single_meter",
  "selected_meters",
  "saved_group",
]
const CADENCE: readonly CommandScheduleCadenceType[] = [
  "interval_minutes",
  "daily_time",
  "weekly",
]

function parseSchedulePayload(o: Record<string, unknown>): {
  ok: true
  name: string
  enabled: boolean
  actionType: OperatorActionType
  targetType: OperatorTargetType
  meterIds: string[]
  groupId: string | null
  cadenceType: CommandScheduleCadenceType
  recurrence: CommandScheduleRecurrence
  notes: string
} | { ok: false; error: string } {
  const name = typeof o.name === "string" ? o.name.trim() : ""
  if (!name) return { ok: false, error: "NAME_REQUIRED" }
  const enabled = Boolean(o.enabled)
  const actionType = o.actionType
  const targetType = o.targetType
  const cadenceType = o.cadenceType
  if (!ACTIONS.includes(actionType as OperatorActionType)) {
    return { ok: false, error: "INVALID_ACTION_TYPE" }
  }
  if (!TARGETS.includes(targetType as OperatorTargetType)) {
    return { ok: false, error: "INVALID_TARGET_TYPE" }
  }
  if (!CADENCE.includes(cadenceType as CommandScheduleCadenceType)) {
    return { ok: false, error: "INVALID_CADENCE_TYPE" }
  }
  const meterIds = Array.isArray(o.meterIds)
    ? o.meterIds.filter(
        (x): x is string => typeof x === "string" && x.trim() !== ""
      )
    : []
  const groupId =
    o.groupId === null || o.groupId === undefined || o.groupId === ""
      ? null
      : typeof o.groupId === "string"
        ? o.groupId.trim()
        : null
  const notes = typeof o.notes === "string" ? o.notes.trim() : ""
  const recurrence =
    o.recurrence && typeof o.recurrence === "object"
      ? (o.recurrence as CommandScheduleRecurrence)
      : {}
  return {
    ok: true,
    name,
    enabled,
    actionType: actionType as OperatorActionType,
    targetType: targetType as OperatorTargetType,
    meterIds,
    groupId,
    cadenceType: cadenceType as CommandScheduleCadenceType,
    recurrence,
    notes,
  }
}

async function validateScheduleTargets(
  targetType: OperatorTargetType,
  meterIds: string[],
  groupId: string | null
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string; ids?: string[] }
> {
  if (targetType === "single_meter") {
    if (meterIds.length !== 1) {
      return { ok: false, status: 400, error: "SINGLE_METER_REQUIRES_ONE_ID" }
    }
  } else if (targetType === "selected_meters") {
    if (meterIds.length === 0) {
      return { ok: false, status: 400, error: "SELECTED_METERS_REQUIRED" }
    }
  } else if (targetType === "saved_group") {
    if (!groupId) {
      return { ok: false, status: 400, error: "GROUP_ID_REQUIRED" }
    }
    const graw = await readCommandGroupsRaw()
    if (!graw.ok) {
      return { ok: false, status: 500, error: graw.error }
    }
    const groups = normalizeCommandGroups(graw.parsed)
    const g = groups.find((x) => x.id === groupId)
    if (!g) {
      return { ok: false, status: 400, error: "UNKNOWN_GROUP_ID" }
    }
  }

  if (meterIds.length > 0) {
    const metersRaw = await readMetersJsonRaw()
    if (!metersRaw.ok) {
      return { ok: false, status: 500, error: metersRaw.error }
    }
    const meters = normalizeMeterRows(metersRaw.parsed)
    const allowed = new Set(meters.map((m) => m.id))
    const bad = meterIds.filter((id) => !allowed.has(id))
    if (bad.length > 0) {
      return {
        ok: false,
        status: 400,
        error: "UNKNOWN_METER_IDS",
        ids: bad,
      }
    }
  }
  return { ok: true }
}

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
  const parsed = parseSchedulePayload(o)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const v = await validateScheduleTargets(
    parsed.targetType,
    parsed.meterIds,
    parsed.groupId
  )
  if (!v.ok) {
    return NextResponse.json(
      { error: v.error, ids: v.ids },
      { status: v.status }
    )
  }

  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeCommandSchedules(raw.parsed)
  const now = new Date().toISOString()
  const id = `cs-${crypto.randomUUID()}`
  const row = normalizeCommandSchedule({
    id,
    name: parsed.name,
    enabled: parsed.enabled,
    actionType: parsed.actionType,
    targetType: parsed.targetType,
    meterIds: parsed.meterIds,
    groupId: parsed.groupId,
    cadenceType: parsed.cadenceType,
    recurrence: parsed.recurrence,
    notes: parsed.notes,
    createdAt: now,
    updatedAt: now,
  })
  if (!row) {
    return NextResponse.json({ error: "INVALID_SCHEDULE_ROW" }, { status: 500 })
  }
  const next = [...existing, row]
  const w = await writeCommandSchedulesArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(row, { status: 201 })
}
