import { kickOperatorCommandExecution } from "@/lib/commands/command-execution-worker"
import {
  COMMAND_ENGINE_LIMITS_NOTE,
  SCHEDULE_OVERLAP_SKIP_NOTE,
} from "@/lib/commands/engine-constants"
import {
  loadObisCodeGroupsUnsafe,
  loadOperatorRunsUnsafe,
  loadSchedulesUnsafe,
  withOperatorRunsLock,
  withSchedulesLock,
} from "@/lib/commands/operator-persistence"
import { readCommandGroupsRaw } from "@/lib/commands/operator-file"
import { normalizeCommandGroups } from "@/lib/commands/operator-normalize"
import { resolveCommandExecutionContext } from "@/lib/commands/resolve-command-context"
import {
  computeNextRunAt,
  isScheduleContextuallyAllowed,
  minuteMatchesRunAt,
} from "@/lib/commands/schedule-next-run"
import type { CommandSchedule, OperatorCommandRun } from "@/types/command-operator"

const TICK_MS = 15_000

declare global {
  // eslint-disable-next-line no-var
  var __SUNRISE_COMMAND_SCHEDULER_STARTED__: boolean | undefined
}

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

async function resolveScheduleAutoRunContext(schedule: CommandSchedule): Promise<
  | {
      ok: true
      meterIds: string[]
      targetSummary: string
      meterGroupName: string
      obisCodeGroupName: string
    }
  | { ok: false; error: string }
> {
  if (!schedule.meterGroupId || !schedule.obisCodeGroupId) {
    return { ok: false, error: "MISSING_METER_OR_OBIS_GROUP_ON_SCHEDULE" }
  }

  const graw = await readCommandGroupsRaw()
  if (!graw.ok) {
    return { ok: false, error: graw.error }
  }
  const groups = normalizeCommandGroups(graw.parsed)
  const g = groups.find((x) => x.id === schedule.meterGroupId)
  if (!g) {
    return { ok: false, error: "UNKNOWN_METER_GROUP" }
  }

  const obisGroups = await loadObisCodeGroupsUnsafe()
  const og = obisGroups.find((x) => x.id === schedule.obisCodeGroupId)
  if (!og) {
    return { ok: false, error: "UNKNOWN_OBIS_CODE_GROUP" }
  }

  const ctx = await resolveCommandExecutionContext({
    targetType: "saved_group",
    meterIds: [],
    groupId: schedule.meterGroupId,
  })
  if (!ctx.ok) {
    return { ok: false, error: ctx.error }
  }

  return {
    ok: true,
    meterIds: ctx.meterIds,
    targetSummary: ctx.targetSummary,
    meterGroupName: g.name,
    obisCodeGroupName: og.name,
  }
}

function buildScheduledOperatorRun(
  schedule: CommandSchedule,
  meterIds: string[],
  targetSummary: string,
  meterGroupName: string,
  obisCodeGroupName: string
): OperatorCommandRun {
  const now = new Date().toISOString()
  return {
    id: `cr-${crypto.randomUUID()}`,
    sourceType: "schedule",
    scheduleId: schedule.id,
    actionType: "read",
    targetType: "saved_group",
    targetSummary,
    meterIds,
    resolvedMeterIds: meterIds,
    groupId: schedule.meterGroupId,
    meterGroupId: schedule.meterGroupId,
    obisCodeGroupId: schedule.obisCodeGroupId,
    meterGroupName,
    obisCodeGroupName,
    scheduleName: schedule.name,
    status: "queued",
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

    if (!isScheduleContextuallyAllowed(schedule, now)) {
      await bumpScheduleNextAndNote(
        schedule.id,
        "Skipped: outside date range or daily time window"
      )
      continue
    }

    if (!minuteMatchesRunAt(schedule, now)) {
      if (Number.isFinite(nextTs) && nextTs <= now.getTime()) {
        await bumpScheduleNextAndNote(
          schedule.id,
          "Missed run-at minute; rescheduled forward"
        )
      }
      continue
    }

    const ctx = await resolveScheduleAutoRunContext(schedule)
    if (!ctx.ok) {
      await bumpScheduleNextAndNote(
        schedule.id,
        `Skipped fire: ${ctx.error}`
      )
      continue
    }

    const newRun = buildScheduledOperatorRun(
      schedule,
      ctx.meterIds,
      ctx.targetSummary,
      ctx.meterGroupName,
      ctx.obisCodeGroupName
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
