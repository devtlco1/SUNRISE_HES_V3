import type { MeterProfileRow } from "@/types/configuration"
import type {
  MeterCommStatus,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"

const PHASE: readonly MeterPhaseType[] = ["single", "three_wye", "three_delta"]
const RELAY: readonly MeterRelayStatus[] = [
  "energized",
  "open",
  "unknown",
  "test",
]
const COMM: readonly MeterCommStatus[] = [
  "online",
  "offline",
  "degraded",
  "dormant",
]

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true" || v === 1) return true
  if (v === false || v === "false" || v === 0) return false
  return fallback
}

export function normalizeMeterProfileRow(raw: unknown): MeterProfileRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const name = str(r.name)
  if (!id || !name) return null
  const phaseType =
    typeof r.phaseType === "string" && (PHASE as readonly string[]).includes(r.phaseType)
      ? (r.phaseType as MeterPhaseType)
      : "single"
  const defaultRelayStatus =
    typeof r.defaultRelayStatus === "string" &&
    (RELAY as readonly string[]).includes(r.defaultRelayStatus)
      ? (r.defaultRelayStatus as MeterRelayStatus)
      : "unknown"
  const defaultCommStatus =
    typeof r.defaultCommStatus === "string" &&
    (COMM as readonly string[]).includes(r.defaultCommStatus)
      ? (r.defaultCommStatus as MeterCommStatus)
      : "offline"
  return {
    id,
    name,
    manufacturer: str(r.manufacturer) || "—",
    model: str(r.model) || "—",
    firmware: str(r.firmware) || "—",
    phaseType,
    defaultRelayStatus,
    defaultCommStatus,
    defaultTariffProfileId: str(r.defaultTariffProfileId),
    notes: str(r.notes),
    active: bool(r.active, true),
  }
}

export function normalizeMeterProfileRows(input: unknown): MeterProfileRow[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeMeterProfileRow)
    .filter((row): row is MeterProfileRow => row !== null)
}
