import { kickOperatorCommandExecution } from "@/lib/commands/command-execution-worker"
import { COMMAND_ENGINE_LIMITS_NOTE } from "@/lib/commands/engine-constants"
import { loadLegacyCommandJobs } from "@/lib/commands/legacy-jobs-load"
import { readOperatorRunsRaw } from "@/lib/commands/operator-file"
import { normalizeOperatorRun, normalizeOperatorRuns } from "@/lib/commands/operator-normalize"
import { withOperatorRunsLock } from "@/lib/commands/operator-persistence"
import { resolveCommandExecutionContext } from "@/lib/commands/resolve-command-context"
import { mergeAndSortUnifiedRuns } from "@/lib/commands/unified-runs"
import type { OperatorActionType, OperatorTargetType } from "@/types/command-operator"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ACTIONS: readonly OperatorActionType[] = ["read", "relay_on", "relay_off"]
const TARGETS: readonly OperatorTargetType[] = [
  "single_meter",
  "selected_meters",
  "saved_group",
]

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

  const ctx = await resolveCommandExecutionContext({
    targetType: targetType as OperatorTargetType,
    meterIds,
    groupId,
  })

  if (!ctx.ok) {
    return NextResponse.json(
      { error: "INVALID_TARGET", detail: ctx.error },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const id = `cr-${crypto.randomUUID()}`

  const draft = {
    id,
    sourceType: "manual" as const,
    scheduleId: null,
    actionType,
    targetType,
    targetSummary: ctx.targetSummary,
    meterIds: ctx.meterIds,
    resolvedMeterIds: ctx.meterIds,
    groupId,
    status: "queued" as const,
    readProfileMode:
      actionType === "read" ? readProfileMode ?? "default_register_pull" : undefined,
    createdAt: now,
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    resultSummary: "Queued for execution",
    errorSummary: null,
    executionNote: COMMAND_ENGINE_LIMITS_NOTE,
    perMeterResults: [] as const,
  }

  const row = normalizeOperatorRun(draft)
  if (!row) {
    return NextResponse.json({ error: "INVALID_RUN_ROW" }, { status: 500 })
  }

  try {
    await withOperatorRunsLock(async (runs) => ({
      next: [...runs, row],
      result: undefined,
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PERSIST_FAILED"
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  kickOperatorCommandExecution(row.id)

  return NextResponse.json(row, { status: 201 })
}
