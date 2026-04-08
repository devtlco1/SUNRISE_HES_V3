import type {
  MeterAlarmState,
  MeterCommStatus,
  MeterListRow,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"

const COMM: readonly MeterCommStatus[] = [
  "online",
  "offline",
  "degraded",
  "dormant",
]
const RELAY: readonly MeterRelayStatus[] = [
  "energized",
  "open",
  "unknown",
  "test",
]
const ALARM: readonly MeterAlarmState[] = ["none", "warning", "critical"]
const PHASE: readonly MeterPhaseType[] = ["single", "three_wye", "three_delta"]

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function isMember<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
}

/** Maps one JSON object to `MeterListRow` or drops invalid records. */
export function normalizeMeterRow(raw: unknown): MeterListRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const id = nonEmptyString(r.id)
  const serialNumber = nonEmptyString(r.serialNumber)
  const customerName = nonEmptyString(r.customerName)
  const feeder = nonEmptyString(r.feeder)
  const transformer = nonEmptyString(r.transformer)
  const zone = nonEmptyString(r.zone)
  const manufacturer = nonEmptyString(r.manufacturer)
  const model = nonEmptyString(r.model)
  const lastReadingAt = nonEmptyString(r.lastReadingAt)
  const lastCommunicationAt = nonEmptyString(r.lastCommunicationAt)
  const firmwareVersion = nonEmptyString(r.firmwareVersion)

  if (
    !id ||
    !serialNumber ||
    !customerName ||
    !feeder ||
    !transformer ||
    !zone ||
    !manufacturer ||
    !model ||
    !lastReadingAt ||
    !lastCommunicationAt ||
    !firmwareVersion
  ) {
    return null
  }

  if (!isMember(r.commStatus, COMM)) return null
  if (!isMember(r.relayStatus, RELAY)) return null
  if (!isMember(r.alarmState, ALARM)) return null
  if (!isMember(r.phaseType, PHASE)) return null

  function optId(k: string): string {
    const v = r[k]
    return typeof v === "string" ? v.trim() : ""
  }

  return {
    id,
    serialNumber,
    customerName,
    feeder,
    transformer,
    zone,
    manufacturer,
    model,
    commStatus: r.commStatus,
    relayStatus: r.relayStatus,
    lastReadingAt,
    lastCommunicationAt,
    alarmState: r.alarmState,
    phaseType: r.phaseType,
    firmwareVersion,
    meterProfileId: optId("meterProfileId"),
    feederId: optId("feederId"),
    transformerId: optId("transformerId"),
    zoneId: optId("zoneId"),
    tariffProfileId: optId("tariffProfileId"),
  }
}

export function normalizeMeterRows(input: unknown): MeterListRow[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeMeterRow)
    .filter((row): row is MeterListRow => row !== null)
}
