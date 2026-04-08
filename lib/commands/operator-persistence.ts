import {
  readCommandSchedulesRaw,
  readOperatorRunsRaw,
  writeCommandSchedulesArray,
  writeOperatorRunsArray,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandSchedules,
  normalizeOperatorRuns,
} from "@/lib/commands/operator-normalize"
import type {
  CommandSchedule,
  OperatorCommandRun,
} from "@/types/command-operator"

/** Serialize all JSON writes to command-runs.json (interleaved HTTP + scheduler + worker). */
let runsWriteChain: Promise<void> = Promise.resolve()

export function withOperatorRunsLock<T = void>(
  fn: (runs: OperatorCommandRun[]) => Promise<{
    next: OperatorCommandRun[]
    result: T
  }>
): Promise<T> {
  const p = runsWriteChain.then(() => runRunsMutation(fn))
  runsWriteChain = p.then(
    () => undefined,
    () => undefined
  )
  return p
}

async function runRunsMutation<T>(
  fn: (runs: OperatorCommandRun[]) => Promise<{
    next: OperatorCommandRun[]
    result: T
  }>
): Promise<T> {
  const raw = await readOperatorRunsRaw()
  if (!raw.ok) {
    throw new Error(raw.error)
  }
  const runs = normalizeOperatorRuns(raw.parsed)
  const { next, result } = await fn(runs)
  const w = await writeOperatorRunsArray(next as unknown[])
  if (!w.ok) {
    throw new Error(w.error)
  }
  return result
}

let schedulesWriteChain: Promise<void> = Promise.resolve()

export function withSchedulesLock<T>(
  fn: (rows: CommandSchedule[]) => Promise<{
    next: CommandSchedule[]
    result: T
  }>
): Promise<T> {
  const p = schedulesWriteChain.then(() => runSchedulesMutation(fn))
  schedulesWriteChain = p.then(
    () => undefined,
    () => undefined
  )
  return p
}

async function runSchedulesMutation<T>(
  fn: (rows: CommandSchedule[]) => Promise<{
    next: CommandSchedule[]
    result: T
  }>
): Promise<T> {
  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) {
    throw new Error(raw.error)
  }
  const rows = normalizeCommandSchedules(raw.parsed)
  const { next, result } = await fn(rows)
  const w = await writeCommandSchedulesArray(next as unknown[])
  if (!w.ok) {
    throw new Error(w.error)
  }
  return result
}

export async function loadOperatorRunsUnsafe(): Promise<OperatorCommandRun[]> {
  const raw = await readOperatorRunsRaw()
  if (!raw.ok) return []
  return normalizeOperatorRuns(raw.parsed)
}

export async function loadSchedulesUnsafe(): Promise<CommandSchedule[]> {
  const raw = await readCommandSchedulesRaw()
  if (!raw.ok) return []
  return normalizeCommandSchedules(raw.parsed)
}
