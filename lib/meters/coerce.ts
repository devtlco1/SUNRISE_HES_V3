/**
 * Lenient coercion for meter rows (forms, CSV import) while preserving strict JSON normalization for reads.
 */

import { slugId } from "@/lib/meters/id-slug"
import type {
  MeterAlarmState,
  MeterCommStatus,
  MeterListRow,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"

const DASH = "—"

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

function str(v: unknown, fallback = DASH): string {
  if (typeof v === "string") {
    const t = v.trim()
    return t !== "" ? t : fallback
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return fallback
}

function parseComm(v: string): MeterCommStatus {
  const x = v.trim().toLowerCase().replace(/\s+/g, "")
  const map: Record<string, MeterCommStatus> = {
    online: "online",
    offline: "offline",
    degraded: "degraded",
    dormant: "dormant",
  }
  return map[x] ?? "offline"
}

function parseRelay(v: string): MeterRelayStatus {
  const x = v.trim().toLowerCase().replace(/\s+/g, "")
  const map: Record<string, MeterRelayStatus> = {
    energized: "energized",
    open: "open",
    unknown: "unknown",
    test: "test",
  }
  return map[x] ?? "unknown"
}

function parseAlarm(v: string): MeterAlarmState {
  const x = v.trim().toLowerCase().replace(/\s+/g, "")
  const map: Record<string, MeterAlarmState> = {
    none: "none",
    warning: "warning",
    critical: "critical",
  }
  return map[x] ?? "none"
}

function parsePhase(v: string): MeterPhaseType {
  const x = v.trim().toLowerCase()
  if (x === "three_delta" || x.includes("delta")) return "three_delta"
  if (x === "three_wye" || x.includes("wye")) return "three_wye"
  if (x === "single" || x.includes("single") || x === "1φ") return "single"
  if (PHASE.includes(x as MeterPhaseType)) return x as MeterPhaseType
  return "single"
}

export type CoerceMeterOptions = {
  /** When absent, a new id is allocated from serial. */
  usedIds: Set<string>
}

/**
 * Build a valid `MeterListRow` from loose input (form / CSV). `serialNumber` must be non-empty.
 * When `id` is empty, generates a unique internal id from serial.
 */
export function coerceMeterRow(
  raw: unknown,
  opts: CoerceMeterOptions
): MeterListRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const serialNumber = str(r.serialNumber, "").trim()
  if (!serialNumber) return null

  let id = str(r.id, "").trim()
  if (!id) {
    id = slugId(serialNumber, opts.usedIds)
  } else {
    opts.usedIds.add(id)
  }

  function optRef(k: string): string {
    const v = r[k]
    return typeof v === "string" ? v.trim() : ""
  }

  return {
    id,
    serialNumber,
    customerName: str(r.customerName),
    feeder: str(r.feeder),
    transformer: str(r.transformer),
    zone: str(r.zone),
    manufacturer: str(r.manufacturer),
    model: str(r.model),
    commStatus: typeof r.commStatus === "string" && (COMM as readonly string[]).includes(r.commStatus)
      ? (r.commStatus as MeterCommStatus)
      : parseComm(str(r.commStatus, "offline")),
    relayStatus:
      typeof r.relayStatus === "string" && (RELAY as readonly string[]).includes(r.relayStatus)
        ? (r.relayStatus as MeterRelayStatus)
        : parseRelay(str(r.relayStatus, "unknown")),
    lastReadingAt: str(r.lastReadingAt),
    lastCommunicationAt: str(r.lastCommunicationAt),
    alarmState:
      typeof r.alarmState === "string" && (ALARM as readonly string[]).includes(r.alarmState)
        ? (r.alarmState as MeterAlarmState)
        : parseAlarm(str(r.alarmState, "none")),
    phaseType:
      typeof r.phaseType === "string" && (PHASE as readonly string[]).includes(r.phaseType)
        ? (r.phaseType as MeterPhaseType)
        : parsePhase(str(r.phaseType, "single")),
    firmwareVersion: str(r.firmwareVersion),
    meterProfileId: optRef("meterProfileId"),
    feederId: optRef("feederId"),
    transformerId: optRef("transformerId"),
    zoneId: optRef("zoneId"),
    tariffProfileId: optRef("tariffProfileId"),
  }
}
