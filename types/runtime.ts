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

/** Highest-level lifecycle stage this operation belongs to (for staging / harness). */
export type RuntimeCapabilityStage =
  | "none"
  | "configuration"
  | "transport_probe"
  | "dlms_association"
  | "cosem_read"
  | "relay_control"

/**
 * Explicit outcome semantics — do not conflate with HTTP status.
 * - `simulated_success`: stub only; never implies on-wire proof.
 * - `transport_reachable_unverified`: e.g. TCP connect OK; DLMS not verified.
 * - `verified_on_wire_success`: DLMS AARE association-result accepted (0) parsed from wire bytes.
 */
export type RuntimeOperationOutcome =
  | "not_attempted"
  | "not_implemented"
  | "attempted_failed"
  | "simulated_success"
  | "transport_reachable_unverified"
  | "verified_on_wire_success"

export interface RuntimeExecutionDiagnostics {
  outcome: RuntimeOperationOutcome
  capabilityStage: RuntimeCapabilityStage
  transportAttempted: boolean
  associationAttempted: boolean
  /** True only when the stack can prove an on-air / on-wire DLMS/COSEM outcome. */
  verifiedOnWire: boolean
  /** Stable machine-oriented code (e.g. PROBE_TCP_TIMEOUT, ASSOCIATION_NOT_IMPLEMENTED). */
  detailCode?: string
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
  /** Capability / staging trace; optional for backward compatibility with older clients. */
  diagnostics?: RuntimeExecutionDiagnostics
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

/** How the probe was produced (simulator vs optional TCP reachability check). */
export type RuntimeProbeKind = "simulator" | "tcp_socket" | "none"

export interface ProbeConnectionPayload {
  reachable: boolean
  protocolStackHint: string
  probeKind: RuntimeProbeKind
  /** Stub/simulator latency model only (omit on real TCP probe). */
  latencyMsSimulated?: number
  /** Wall time for TCP connect handshake when probeKind is tcp_socket. */
  roundTripMs?: number
  remoteHost?: string
  remotePort?: number
}

export interface AssociatePayload {
  associationLevel: string
  securitySuite: string
  /** Stub only — not a live DLMS security context. */
  simulatedAssociationToken?: string
  /** Real path: HDLC over TCP when used. */
  linkChannel?: "hdlc_tcp"
  /** COSEM association-result enum from parsed AARE (0 = accepted). */
  aareAssociationResult?: number
  /** Raw AARE APDU (starts with 0x61) as hex for audit; omit when absent. */
  aareApduHex?: string
  hdlcServerAddress?: number
  hdlcClientAddress?: number
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
