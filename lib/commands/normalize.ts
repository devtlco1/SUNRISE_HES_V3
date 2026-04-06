import type {
  CommandJobRow,
  CommandMeterResult,
  CommandQueueState,
  CommandTemplateId,
  MeterCommandResultState,
} from "@/types/command"

const TEMPLATE_IDS: readonly CommandTemplateId[] = [
  "disconnect_relay",
  "reconnect_relay",
  "on_demand_read",
  "read_profile",
  "sync_time",
  "ping_comm",
]

const QUEUE_STATES: readonly CommandQueueState[] = [
  "submitted",
  "queued",
  "dispatching",
  "running",
  "completed",
  "partial_failure",
  "failed",
  "cancelled",
]

const METER_RESULT_STATES: readonly MeterCommandResultState[] = [
  "pending",
  "queued",
  "running",
  "success",
  "failed",
  "timeout",
  "rejected",
]

const PRIORITIES = ["low", "normal", "high"] as const

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function isMember<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
}

function nonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    return null
  }
  if (v < 0) return null
  return v
}

function normalizeMeterResult(raw: unknown): CommandMeterResult | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const meterId = nonEmptyString(r.meterId)
  const serialNumber = nonEmptyString(r.serialNumber)
  const responseSummary = nonEmptyString(r.responseSummary)
  const updatedAt = nonEmptyString(r.updatedAt)
  if (!meterId || !serialNumber || !responseSummary || !updatedAt) return null
  if (!isMember(r.state, METER_RESULT_STATES)) return null
  return {
    meterId,
    serialNumber,
    state: r.state,
    responseSummary,
    updatedAt,
  }
}

export function normalizeCommandJobRow(raw: unknown): CommandJobRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const id = nonEmptyString(r.id)
  const templateName = nonEmptyString(r.templateName)
  const commandType = nonEmptyString(r.commandType)
  const submittedBy = nonEmptyString(r.submittedBy)
  const submittedAt = nonEmptyString(r.submittedAt)
  const resultSummary = nonEmptyString(r.resultSummary)

  const targetCount = nonNegInt(r.targetCount)
  const successCount = nonNegInt(r.successCount)
  const failedCount = nonNegInt(r.failedCount)
  const pendingCount = nonNegInt(r.pendingCount)
  const cancelledCount = nonNegInt(r.cancelledCount)

  if (
    !id ||
    !templateName ||
    !commandType ||
    !submittedBy ||
    !submittedAt ||
    !resultSummary ||
    targetCount === null ||
    successCount === null ||
    failedCount === null ||
    pendingCount === null ||
    cancelledCount === null
  ) {
    return null
  }

  if (!isMember(r.templateId, TEMPLATE_IDS)) return null
  if (!isMember(r.queueState, QUEUE_STATES)) return null
  if (!isMember(r.priority, PRIORITIES)) return null

  const meterRaw = r.meterResults
  if (!Array.isArray(meterRaw)) return null

  const meterResults: CommandMeterResult[] = []
  for (const item of meterRaw) {
    const m = normalizeMeterResult(item)
    if (!m) return null
    meterResults.push(m)
  }

  if (meterResults.length !== targetCount) return null

  let operatorNote: string | undefined
  if (r.operatorNote !== undefined && r.operatorNote !== null) {
    if (typeof r.operatorNote !== "string") return null
    const t = r.operatorNote.trim()
    operatorNote = t === "" ? undefined : t
  }

  return {
    id,
    templateId: r.templateId,
    templateName,
    commandType,
    targetCount,
    submittedBy,
    submittedAt,
    queueState: r.queueState,
    successCount,
    failedCount,
    pendingCount,
    cancelledCount,
    resultSummary,
    operatorNote,
    priority: r.priority,
    meterResults,
  }
}

export function normalizeCommandJobRows(input: unknown): CommandJobRow[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeCommandJobRow)
    .filter((row): row is CommandJobRow => row !== null)
}
