import { COMMAND_ENGINE_LIMITS_NOTE } from "@/lib/commands/engine-constants"
import {
  executeMeterReadObisSelection,
  executeMeterRuntimeAction,
} from "@/lib/commands/meter-runtime-action"
import { catalogEntriesToSelectionItems } from "@/lib/commands/obis-selection-from-codes"
import {
  loadObisCodeGroupsUnsafe,
  loadOperatorRunsUnsafe,
  withOperatorRunsLock,
  withSchedulesLock,
} from "@/lib/commands/operator-persistence"
import { readObisCatalog } from "@/lib/obis/catalog-store"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import type {
  CommandActionGroup,
  OperatorActionType,
  OperatorCommandMeterResult,
  OperatorCommandRun,
  OperatorCommandRunStatus,
} from "@/types/command-operator"
import type { ObisSelectionItemInput } from "@/types/runtime"

const activeRunWorkers = new Set<string>()

export function kickOperatorCommandExecution(runId: string): void {
  void runOperatorCommandExecution(runId)
}

async function markRunEngineFailure(runId: string, message: string) {
  const now = new Date().toISOString()
  await withOperatorRunsLock(async (runs) => {
    const idx = runs.findIndex((r) => r.id === runId)
    if (idx < 0) return { next: runs, result: undefined }
    const r = runs[idx]!
    if (r.status === "completed" || r.status === "failed" || r.status === "cancelled") {
      return { next: runs, result: undefined }
    }
    const next = [...runs]
    next[idx] = {
      ...r,
      status: "failed",
      finishedAt: now,
      resultSummary: "Engine failure before completion",
      errorSummary: message.slice(0, 2000),
      executionNote: `${r.executionNote} | ${COMMAND_ENGINE_LIMITS_NOTE}`,
    }
    return { next, result: undefined }
  })

  const snap = (await loadOperatorRunsUnsafe()).find((r) => r.id === runId)
  if (snap?.sourceType === "schedule" && snap.scheduleId) {
    await recordScheduleRunFinished(snap.scheduleId, runId, "failed", message)
  }
}

async function recordScheduleRunFinished(
  scheduleId: string,
  runId: string,
  outcome: "ok" | "partial" | "failed",
  summary: string
) {
  const now = new Date().toISOString()
  await withSchedulesLock(async (schedules) => {
    const idx = schedules.findIndex((s) => s.id === scheduleId)
    if (idx < 0) return { next: schedules, result: undefined }
    const s = schedules[idx]!
    const next = [...schedules]
    const onceDone = s.scheduleType === "once"
    next[idx] = {
      ...s,
      lastRunAt: now,
      lastRunId: runId,
      lastOutcomeSummary: `${outcome}: ${summary}`.slice(0, 500),
      updatedAt: now,
      enabled: onceDone ? false : s.enabled,
      nextRunAt: onceDone ? null : s.nextRunAt,
    }
    return { next, result: undefined }
  })
}

function aggregateStatus(
  ok: number,
  fail: number
): { status: OperatorCommandRunStatus; resultSummary: string; errorSummary: string | null } {
  if (fail === 0) {
    return {
      status: "completed",
      resultSummary: `${ok} / ${ok} meters succeeded`,
      errorSummary: null,
    }
  }
  if (ok === 0) {
    return {
      status: "failed",
      resultSummary: `0 / ${fail} meters succeeded`,
      errorSummary: `${fail} meter(s) failed`,
    }
  }
  return {
    status: "failed",
    resultSummary: `${ok} succeeded, ${fail} failed (partial)`,
    errorSummary: `${fail} meter(s) failed in batch`,
  }
}

/** Attach first meter failure text so operators see a concrete reason, not only counts. */
function enrichErrorSummary(
  base: string | null,
  perMeter: OperatorCommandMeterResult[]
): string | null {
  const first = perMeter.find((p) => p.state === "failed")
  if (!first) return base
  const hint = `${first.serialNumber}: ${first.summary}`
    .replace(/\s+/g, " ")
    .slice(0, 200)
  const detail =
    first.errorDetail && !hint.includes(first.errorDetail.slice(0, 30))
      ? ` (${first.errorDetail.replace(/\s+/g, " ").slice(0, 120)})`
      : ""
  const full = `${hint}${detail}`.slice(0, 320)
  if (!base) return full
  if (base.includes(first.serialNumber)) return `${base}`.slice(0, 500)
  return `${base} · ${full}`.slice(0, 500)
}

type Plan =
  | { kind: "read_obis"; items: ObisSelectionItemInput[] }
  | { kind: "runtime"; action: OperatorActionType }
  | { kind: "fatal"; message: string }

async function planFromActionGroup(ag: CommandActionGroup): Promise<Plan> {
  if (ag.actionMode === "relay_on") {
    return { kind: "runtime", action: "relay_on" }
  }
  if (ag.actionMode === "relay_off") {
    return { kind: "runtime", action: "relay_off" }
  }

  if (ag.objectCodes.length === 0) {
    return {
      kind: "fatal",
      message:
        "read_catalog group has no object codes — fix the action group definition",
    }
  }

  const catalog = await readObisCatalog()
  const items = catalogEntriesToSelectionItems(ag.objectCodes, catalog)
  if (items.length === 0) {
    return {
      kind: "fatal",
      message: `No enabled catalog rows matched ${ag.objectCodes.length} object code(s). Codes may be wrong, disabled in the PRM catalog, or missing from data/obis-catalog.json.`,
    }
  }
  return { kind: "read_obis", items }
}

async function buildExecutionPlan(snapshot: OperatorCommandRun): Promise<Plan> {
  if (snapshot.obisCodeGroupId) {
    const groups = await loadObisCodeGroupsUnsafe()
    const ag = groups.find((g) => g.id === snapshot.obisCodeGroupId)
    if (!ag) {
      return {
        kind: "fatal",
        message: `Action group id ${snapshot.obisCodeGroupId} not found`,
      }
    }
    return planFromActionGroup(ag)
  }

  return { kind: "runtime", action: snapshot.actionType }
}

async function runOperatorCommandExecution(runId: string): Promise<void> {
  if (activeRunWorkers.has(runId)) return
  activeRunWorkers.add(runId)
  try {
    const snapshot = await withOperatorRunsLock<OperatorCommandRun | null>(
      async (runs) => {
        const idx = runs.findIndex((r) => r.id === runId)
        if (idx < 0) return { next: runs, result: null }
        const r = runs[idx]!
        if (r.status !== "queued") {
          return { next: runs, result: null }
        }
        const now = new Date().toISOString()
        const next = [...runs]
        next[idx] = {
          ...r,
          status: "running",
          startedAt: now,
          resultSummary: "Executing meters…",
        }
        return { next, result: { ...next[idx]! } }
      }
    )

    if (!snapshot || snapshot.status !== "running") {
      return
    }

    const plan = await buildExecutionPlan(snapshot)
    if (plan.kind === "fatal") {
      await markRunEngineFailure(runId, plan.message)
      return
    }

    const metersRaw = await readMetersJsonRaw()
    const meters = metersRaw.ok ? normalizeMeterRows(metersRaw.parsed) : []
    const metersById = new Map(meters.map((m) => [m.id, m]))

    const perMeter: OperatorCommandMeterResult[] = []
    for (const meterId of snapshot.resolvedMeterIds) {
      const out =
        plan.kind === "read_obis"
          ? await executeMeterReadObisSelection({
              meterId,
              selectedItems: plan.items,
            })
          : await executeMeterRuntimeAction({
              meterId,
              action: plan.action,
              readProfileMode: snapshot.readProfileMode,
            })
      const m = metersById.get(meterId)
      perMeter.push({
        meterId,
        serialNumber: m?.serialNumber ?? meterId,
        state: out.ok ? "success" : "failed",
        summary: out.summary,
        finishedAt: new Date().toISOString(),
        errorDetail: out.errorDetail,
      })
    }

    const okN = perMeter.filter((p) => p.state === "success").length
    const failN = perMeter.length - okN
    const { status, resultSummary, errorSummary } = aggregateStatus(okN, failN)
    const errorSummaryRich = enrichErrorSummary(errorSummary, perMeter)
    const done = new Date().toISOString()

    await withOperatorRunsLock(async (runs) => {
      const idx = runs.findIndex((r) => r.id === runId)
      if (idx < 0) return { next: runs, result: undefined }
      const r = runs[idx]!
      const next = [...runs]
      next[idx] = {
        ...r,
        status,
        finishedAt: done,
        perMeterResults: perMeter,
        resultSummary,
        errorSummary: errorSummaryRich,
        executionNote: `${r.executionNote} | ${COMMAND_ENGINE_LIMITS_NOTE}`.trim(),
      }
      return { next, result: undefined }
    })

    if (snapshot.sourceType === "schedule" && snapshot.scheduleId) {
      const outcome =
        failN === 0 ? "ok" : okN === 0 ? "failed" : "partial"
      await recordScheduleRunFinished(
        snapshot.scheduleId,
        runId,
        outcome,
        resultSummary
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markRunEngineFailure(runId, msg)
  } finally {
    activeRunWorkers.delete(runId)
  }
}
