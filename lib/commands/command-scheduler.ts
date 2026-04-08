import { kickOperatorCommandExecution } from "@/lib/commands/command-execution-worker"
import {
  COMMAND_ENGINE_LIMITS_NOTE,
  SCHEDULE_OVERLAP_SKIP_NOTE,
} from "@/lib/commands/engine-constants"
import {
  loadOperatorRunsUnsafe,
  loadSchedulesUnsafe,
  withOperatorRunsLock,
  withSchedulesLock,
} from "@/lib/commands/operator-persistence"
import { resolveCommandExecutionContext } from "@/lib/commands/resolve-command-context"
import { computeNextRunAt } from "@/lib/commands/schedule-next-run"
import type { CommandSchedule, OperatorCommandRun } from "@/types/command-operator"

const TICK_MS = 15_000

declare global {
  // eslint-disable-next-line no-var
  var __SUNRISE_COMMAND_SCHEDULER_STARTED__: boolean | undefined
}

/**
 * Overlap policy: if a schedule already has a run in `queued` or `running`, skip the new fire,
 * bump `nextRunAt`, and record `lastSchedulerNote`. No second queue depth — avoids piling work.
 */
function scheduleHasBlockingRun(
  runs: OperatorCommandRun[],
  scheduleId: string
): boolean {
  return runs.some(
    (r) =>
      r.scheduleId === scheduleId &&
      (r.status === "queued" || r.status === "running")
  )
}

function buildScheduledOperatorRun(
  schedule: CommandSchedule,
  meterIds: string[],
  targetSummary: string
): OperatorCommandRun {
  const now = new Date().toISOString()
  return {
    id: `cr-${crypto.randomUUID()}`,
    sourceType: "schedule",
    scheduleId: schedule.id,
    actionType: schedule.actionType,
    targetType: schedule.targetType,
    targetSummary,
    meterIds,
    resolvedMeterIds: meterIds,
    groupId: schedule.targetType === "saved_group" ? schedule.groupId : null,
    status: "queued",
    readProfileMode:
      schedule.actionType === "read"
        ? "default_register_pull"
        : undefined,
    createdAt: now,
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    resultSummary: "Queued for execution",
    errorSummary: null,
    executionNote: `Scheduled: ${schedule.name}. ${COMMAND_ENGINE_LIMITS_NOTE}`,
    perMeterResults: [],
  }
}

async function bumpScheduleNextAndNote(
  scheduleId: string,
  note: string
): Promise<void> {
  const now = new Date().toISOString()
  await withSchedulesLock(async (rows) => {
    const idx = rows.findIndex((s) => s.id === scheduleId)
    if (idx < 0) return { next: rows, result: undefined }
    const s = rows[idx]!
    const nextAt = computeNextRunAt(s, new Date())
    const next = [...rows]
    next[idx] = {
      ...s,
      nextRunAt: nextAt.toISOString(),
      lastSchedulerNote: note.slice(0, 500),
      updatedAt: now,
    }
    return { next, result: undefined }
  })
}

async function appendScheduledRunAndBumpNext(
  schedule: CommandSchedule,
  newRun: OperatorCommandRun
): Promise<void> {
  const now = new Date().toISOString()
  await withOperatorRunsLock(async (runs) => ({
    next: [...runs, newRun],
    result: undefined,
  }))

  await withSchedulesLock(async (rows) => {
    const idx = rows.findIndex((s) => s.id === schedule.id)
    if (idx < 0) return { next: rows, result: undefined }
    const s = rows[idx]!
    const nextAt = computeNextRunAt(s, new Date())
    const next = [...rows]
    next[idx] = {
      ...s,
      nextRunAt: nextAt.toISOString(),
      lastSchedulerNote: "",
      updatedAt: now,
    }
    return { next, result: undefined }
  })

  kickOperatorCommandExecution(newRun.id)
}

export async function tickCommandSchedulerOnce(): Promise<void> {
  const now = new Date()
  const schedules = await loadSchedulesUnsafe()
  let runs = await loadOperatorRunsUnsafe()

  for (const schedule of schedules) {
    if (!schedule.enabled) continue

    const nextTs = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : 0
    if (Number.isFinite(nextTs) && nextTs > now.getTime()) {
      continue
    }

    if (scheduleHasBlockingRun(runs, schedule.id)) {
      await bumpScheduleNextAndNote(schedule.id, SCHEDULE_OVERLAP_SKIP_NOTE)
      continue
    }

    const ctx = await resolveCommandExecutionContext({
      targetType: schedule.targetType,
      meterIds: schedule.meterIds,
      groupId: schedule.groupId,
    })

    if (!ctx.ok) {
      await bumpScheduleNextAndNote(
        schedule.id,
        `Skipped fire: target resolution failed — ${ctx.error}`
      )
      continue
    }

    const newRun = buildScheduledOperatorRun(
      schedule,
      ctx.meterIds,
      ctx.targetSummary
    )
    await appendScheduledRunAndBumpNext(schedule, newRun)
    runs = [...runs, newRun]
  }
}

export function startCommandScheduler(): void {
  if (process.env.NEXT_RUNTIME === "edge") return
  if (globalThis.__SUNRISE_COMMAND_SCHEDULER_STARTED__) return
  globalThis.__SUNRISE_COMMAND_SCHEDULER_STARTED__ = true

  if (process.env.COMMANDS_SCHEDULER_ENABLED === "false") {
    console.info(
      "[commands-scheduler] disabled (COMMANDS_SCHEDULER_ENABLED=false). Schedules remain definitions only until enabled."
    )
    return
  }

  console.info(
    `[commands-scheduler] started (tick ${TICK_MS}ms). In-process only; not distributed.`
  )

  setInterval(() => {
    void tickCommandSchedulerOnce().catch((e) => {
      console.error("[commands-scheduler] tick error", e)
    })
  }, TICK_MS)

  void tickCommandSchedulerOnce().catch((e) => {
    console.error("[commands-scheduler] initial tick error", e)
  })
}
