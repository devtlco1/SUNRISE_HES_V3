/**
 * Smart meter runtime domain types (protocol-agnostic, UI-agnostic).
 * Used by adapters and internal APIs — not tied to React or Next.js.
 */

export type TransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded"
  | "error"

export type AssociationState =
  | "none"
  | "associating"
  | "associated"
  | "failed"

/** Logical operations exposed by the runtime boundary. */
export type RuntimeOperation =
  | "probeConnection"
  | "associate"
  | "readIdentity"
  | "readClock"
  | "readBasicRegisters"
  | "relayDisconnect"
  | "relayReconnect"

export interface RuntimeErrorInfo {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Common envelope for all runtime outcomes.
 * `simulated: true` is required for stub responses; real adapters set false when backed by hardware.
 */
export interface RuntimeResponseEnvelope<TPayload = unknown> {
  ok: boolean
  simulated: boolean
  operation: RuntimeOperation
  meterId: string
  startedAt: string
  finishedAt: string
  durationMs: number
  message: string
  transportState: TransportState
  associationState: AssociationState
  payload?: TPayload
  error?: RuntimeErrorInfo
}

/** Target for any single-meter runtime action. */
export interface RuntimeTargetRequest {
  meterId: string
  /** Optional HES endpoint / head-end route hint (stub may echo only). */
  endpointId?: string
  /** Optional logical channel / association hint (stub may echo only). */
  channelHint?: string
}

export type ProbeConnectionRequest = RuntimeTargetRequest
export type AssociateRequest = RuntimeTargetRequest
export type ReadIdentityRequest = RuntimeTargetRequest
export type ReadClockRequest = RuntimeTargetRequest
export type ReadBasicRegistersRequest = RuntimeTargetRequest
export type RelayDisconnectRequest = RuntimeTargetRequest
export type RelayReconnectRequest = RuntimeTargetRequest

export interface ProbeConnectionPayload {
  reachable: boolean
  /** Round-trip delay implied by the simulator only; not measured on a live link. */
  latencyMsSimulated: number
  protocolStackHint: string
}

export interface AssociatePayload {
  associationLevel: string
  securitySuite: string
  /** Opaque simulator token — not a live DLMS association context. */
  simulatedAssociationToken: string
}

export interface IdentityPayload {
  serialNumber: string
  manufacturer: string
  model: string
  firmwareVersion: string
  protocolVersion: string
  logicalDeviceName?: string
}

export interface ClockPayload {
  deviceTimeUtc: string
  /** Simulator-only estimate; not derived from a real meter clock compare. */
  timeSkewMsEstimated?: number
}

export interface BasicRegisterReading {
  value: string
  unit?: string
  quality?: string
}

export interface BasicRegistersPayload {
  /** OBIS-style keys; values are simulator-backed only. */
  registers: Record<string, BasicRegisterReading>
}

export interface RelaySimulatedPayload {
  /**
   * Simulated relay posture for UX/contracts only.
   * Does not reflect a physical disconnector or service switch change.
   */
  simulatedRelayState: "disconnected" | "connected" | "unknown"
  acceptanceNote: string
}
