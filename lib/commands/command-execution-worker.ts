import { COMMAND_ENGINE_LIMITS_NOTE } from "@/lib/commands/engine-constants"
import { executeMeterRuntimeAction } from "@/lib/commands/meter-runtime-action"
import {
  loadOperatorRunsUnsafe,
  withOperatorRunsLock,
  withSchedulesLock,
} from "@/lib/commands/operator-persistence"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import type {
  OperatorCommandMeterResult,
  OperatorCommandRun,
  OperatorCommandRunStatus,
} from "@/types/command-operator"

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
    next[idx] = {
      ...s,
      lastRunAt: now,
      lastRunId: runId,
      lastOutcomeSummary: `${outcome}: ${summary}`.slice(0, 500),
      updatedAt: now,
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
    status: "completed",
    resultSummary: `${ok} succeeded, ${fail} failed (partial)`,
    errorSummary: `${fail} meter(s) failed in batch`,
  }
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

    const metersRaw = await readMetersJsonRaw()
    const meters = metersRaw.ok ? normalizeMeterRows(metersRaw.parsed) : []
    const metersById = new Map(meters.map((m) => [m.id, m]))

    const perMeter: OperatorCommandMeterResult[] = []
    for (const meterId of snapshot.resolvedMeterIds) {
      const out = await executeMeterRuntimeAction({
        meterId,
        action: snapshot.actionType,
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
        errorSummary,
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
