import { loadLegacyCommandJobs } from "@/lib/commands/legacy-jobs-load"
import {
  readCommandGroupsRaw,
  readOperatorRunsRaw,
  writeOperatorRunsArray,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandGroups,
  normalizeOperatorRun,
  normalizeOperatorRuns,
} from "@/lib/commands/operator-normalize"
import { resolveRunTargetSummary } from "@/lib/commands/resolve-run-target"
import { mergeAndSortUnifiedRuns } from "@/lib/commands/unified-runs"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import type {
  CommandGroup,
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

const PHASE1_EXECUTION_NOTE =
  "Phase 1: recorded for audit. No automatic sidecar dispatch from this composer yet — execution engine wiring comes in a later phase."

export async function GET() {
  const opRaw = await readOperatorRunsRaw()
  if (!opRaw.ok) {
    return NextResponse.json({ error: opRaw.error }, { status: 500 })
  }
  const operatorRuns = normalizeOperatorRuns(opRaw.parsed)
  if (operatorRuns.length === 0 && opRaw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_OPERATOR_RUN_ROWS" }, { status: 500 })
  }

  const legacy = await loadLegacyCommandJobs()
  const legacyRows = legacy.ok ? legacy.rows : []

  const rows = mergeAndSortUnifiedRuns(operatorRuns, legacyRows)

  return NextResponse.json(
    { rows, operatorRuns, legacyAvailable: legacy.ok },
    {
      headers: { "Cache-Control": "no-store" },
    }
  )
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}

  const actionType = o.actionType
  const targetType = o.targetType
  if (!ACTIONS.includes(actionType as OperatorActionType)) {
    return NextResponse.json({ error: "INVALID_ACTION_TYPE" }, { status: 400 })
  }
  if (!TARGETS.includes(targetType as OperatorTargetType)) {
    return NextResponse.json({ error: "INVALID_TARGET_TYPE" }, { status: 400 })
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

  const readProfileMode =
    typeof o.readProfileMode === "string" && o.readProfileMode.trim() !== ""
      ? o.readProfileMode.trim()
      : undefined

  const metersRaw = await readMetersJsonRaw()
  if (!metersRaw.ok) {
    return NextResponse.json({ error: metersRaw.error }, { status: 500 })
  }
  const meters = normalizeMeterRows(metersRaw.parsed)
  const metersById = new Map(meters.map((m) => [m.id, m]))

  let group: CommandGroup | null = null
  if (targetType === "saved_group") {
    const graw = await readCommandGroupsRaw()
    if (!graw.ok) {
      return NextResponse.json({ error: graw.error }, { status: 500 })
    }
    const groups = normalizeCommandGroups(graw.parsed)
    group = groupId ? groups.find((g) => g.id === groupId) ?? null : null
  }

  const resolved = resolveRunTargetSummary({
    targetType: targetType as OperatorTargetType,
    meterIds,
    groupId,
    group,
    metersById,
  })

  if (
    resolved.targetSummary.includes("Invalid") ||
    resolved.targetSummary.includes("unknown") ||
    resolved.targetSummary.startsWith("No meter") ||
    resolved.targetSummary.startsWith("No meters")
  ) {
    return NextResponse.json(
      { error: "INVALID_TARGET", detail: resolved.targetSummary },
      { status: 400 }
    )
  }

  if (resolved.meterIds.length === 0) {
    return NextResponse.json(
      { error: "EMPTY_TARGET", detail: resolved.targetSummary },
      { status: 400 }
    )
  }

  const raw = await readOperatorRunsRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const existing = normalizeOperatorRuns(raw.parsed)
  const now = new Date().toISOString()
  const id = `cr-${crypto.randomUUID()}`

  const row = normalizeOperatorRun({
    id,
    actionType,
    targetType,
    targetSummary: resolved.targetSummary,
    meterIds: resolved.meterIds,
    groupId,
    status: "queued",
    readProfileMode:
      actionType === "read" ? readProfileMode ?? "default_register_pull" : undefined,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    resultSummary: "Queued (no runtime dispatch in Phase 1)",
    errorSummary: null,
    executionNote: PHASE1_EXECUTION_NOTE,
  })

  if (!row) {
    return NextResponse.json({ error: "INVALID_RUN_ROW" }, { status: 500 })
  }

  const next = [...existing, row]
  const w = await writeOperatorRunsArray(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }

  return NextResponse.json(row, { status: 201 })
}
