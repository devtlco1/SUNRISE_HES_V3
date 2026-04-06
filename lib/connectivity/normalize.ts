import type { ConnectivityHealthState, ConnectivityListRow } from "@/types/connectivity"
import type { MeterCommStatus } from "@/types/meter"

const COMM: readonly MeterCommStatus[] = [
  "online",
  "offline",
  "degraded",
  "dormant",
]
const HEALTH: readonly ConnectivityHealthState[] = [
  "healthy",
  "degraded",
  "failed",
  "unknown",
]

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function isMember<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
}

export function normalizeConnectivityRow(raw: unknown): ConnectivityListRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  const id = nonEmptyString(r.id)
  const serialNumber = nonEmptyString(r.serialNumber)
  const signalQuality = nonEmptyString(r.signalQuality)
  const lastCommunicationAt = nonEmptyString(r.lastCommunicationAt)
  const lastSuccessfulReadAt = nonEmptyString(r.lastSuccessfulReadAt)
  const networkType = nonEmptyString(r.networkType)
  const routeId = nonEmptyString(r.routeId)
  const gatewayId = nonEmptyString(r.gatewayId)
  const endpoint = nonEmptyString(r.endpoint)
  const firmwareVersion = nonEmptyString(r.firmwareVersion)
  const protocolVersion = nonEmptyString(r.protocolVersion)

  if (
    !id ||
    !serialNumber ||
    !signalQuality ||
    !lastCommunicationAt ||
    !lastSuccessfulReadAt ||
    !networkType ||
    !routeId ||
    !gatewayId ||
    !endpoint ||
    !firmwareVersion ||
    !protocolVersion
  ) {
    return null
  }

  if (!isMember(r.commState, COMM)) return null
  if (!isMember(r.healthState, HEALTH)) return null

  return {
    id,
    serialNumber,
    commState: r.commState,
    healthState: r.healthState,
    signalQuality,
    lastCommunicationAt,
    lastSuccessfulReadAt,
    networkType,
    routeId,
    gatewayId,
    endpoint,
    firmwareVersion,
    protocolVersion,
  }
}

export function normalizeConnectivityRows(input: unknown): ConnectivityListRow[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeConnectivityRow)
    .filter((row): row is ConnectivityListRow => row !== null)
}
