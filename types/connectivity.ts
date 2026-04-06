import type { MeterCommStatus } from "@/types/meter"

export type ConnectivityHealthState =
  | "healthy"
  | "degraded"
  | "failed"
  | "unknown"

/** Operational connectivity monitoring row (mock / future API). */
export type ConnectivityListRow = {
  id: string
  serialNumber: string
  commState: MeterCommStatus
  healthState: ConnectivityHealthState
  signalQuality: string
  lastCommunicationAt: string
  lastSuccessfulReadAt: string
  networkType: string
  routeId: string
  gatewayId: string
  endpoint: string
  firmwareVersion: string
  protocolVersion: string
}
