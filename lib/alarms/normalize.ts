import type {
  AlarmAckState,
  AlarmLifecycleState,
  AlarmListRow,
  AlarmSeverity,
} from "@/types/alarm"

const SEVERITY: readonly AlarmSeverity[] = [
  "critical",
  "major",
  "minor",
  "warning",
  "info",
]
const STATE: readonly AlarmLifecycleState[] = [
  "open",
  "acknowledged",
  "in_progress",
  "cleared",
  "suppressed",
]
const ACK: readonly AlarmAckState[] = [
  "unacknowledged",
  "acknowledged",
  "assigned",
]

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function isMember<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
}

function normalizeAssignedTo(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "string") return null
  const t = v.trim()
  return t === "" ? null : t
}

function occurrenceCount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
    return null
  }
  if (v < 0) return null
  return v
}

export function normalizeAlarmRow(raw: unknown): AlarmListRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const id = nonEmptyString(r.id)
  const meterId = nonEmptyString(r.meterId)
  const serialNumber = nonEmptyString(r.serialNumber)
  const customerName = nonEmptyString(r.customerName)
  const feeder = nonEmptyString(r.feeder)
  const transformer = nonEmptyString(r.transformer)
  const zone = nonEmptyString(r.zone)
  const alarmType = nonEmptyString(r.alarmType)
  const sourceDomain = nonEmptyString(r.sourceDomain)
  const firstSeen = nonEmptyString(r.firstSeen)
  const lastSeen = nonEmptyString(r.lastSeen)
  const summary = nonEmptyString(r.summary)

  const count = occurrenceCount(r.occurrenceCount)
  const assignedTo = normalizeAssignedTo(r.assignedTo)

  if (
    !id ||
    !meterId ||
    !serialNumber ||
    !customerName ||
    !feeder ||
    !transformer ||
    !zone ||
    !alarmType ||
    !sourceDomain ||
    !firstSeen ||
    !lastSeen ||
    !summary ||
    count === null
  ) {
    return null
  }

  if (!isMember(r.severity, SEVERITY)) return null
  if (!isMember(r.state, STATE)) return null
  if (!isMember(r.ackState, ACK)) return null

  return {
    id,
    meterId,
    serialNumber,
    customerName,
    feeder,
    transformer,
    zone,
    alarmType,
    severity: r.severity,
    state: r.state,
    sourceDomain,
    firstSeen,
    lastSeen,
    occurrenceCount: count,
    ackState: r.ackState,
    assignedTo,
    summary,
  }
}

export function normalizeAlarmRows(input: unknown): AlarmListRow[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeAlarmRow)
    .filter((row): row is AlarmListRow => row !== null)
}
