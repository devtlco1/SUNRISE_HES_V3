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
  | "readObisSelection"
  | "discoverSupportedObis"
  | "relayReadStatus"
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
  | "object_discovery"
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
/** Dedicated association-view discovery (not routine polling). */
export type DiscoverSupportedObisRequest = RuntimeTargetRequest
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
  /** Value read from OBIS 0.0.96.1.0.255 only — canonical meter business id; never substitute from logicalDeviceName. */
  serialNumber: string
  manufacturer: string
  model: string
  firmwareVersion: string
  protocolVersion: string
  /** Optional: OBIS 0.0.96.1.1.255 auxiliary identity; does not replace serialNumber. */
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
  /** Set when this OBIS read failed or returned no value (Python MVP-AMI path). */
  error?: string
}

export interface BasicRegistersPayload {
  /** OBIS-style keys; values are simulator-backed only. */
  registers: Record<string, BasicRegisterReading>
}

export type ObisSelectionRowStatus = "ok" | "error" | "unsupported" | "not_attempted"

/** One row returned from read-obis-selection (operator table merge). */
export interface ObisSelectionRowResult {
  obis: string
  value: string
  unit?: string
  quality?: string
  error?: string
  status: ObisSelectionRowStatus
  packKey?: string
  lastReadAt?: string
  resolvedResultFormat?: string
}

export interface ReadObisSelectionPayload {
  rows: ObisSelectionRowResult[]
}

/** One OBIS row requested by the operator (catalog + UI). */
export interface ObisSelectionItemInput {
  obis: string
  description?: string
  objectType: string
  classId: number
  attribute?: number
  scalerUnitAttribute?: number
  unit?: string
  packKey?: string
}

export interface ReadObisSelectionRequest extends RuntimeTargetRequest {
  selectedItems: ObisSelectionItemInput[]
}

/** Polling view for inbound sequential read-obis-selection jobs (Python job store). */
export interface ObisSelectionJobRowPollView {
  index: number
  obis: string
  phase: string
  row?: ObisSelectionRowResult
}

export type ObisSelectionJobPollStatus =
  | "queued"
  | "running"
  | "waiting_for_restage"
  | "completed"
  | "failed"
  | "cancelled"

export interface ObisSelectionJobPollView {
  jobId: string
  status: ObisSelectionJobPollStatus
  meterId: string
  transport: string
  totalRows: number
  wireTotal: number
  completedWire: number
  currentObis?: string | null
  currentIndex?: number | null
  fatalError?: string | null
  stale?: boolean
  restageMessage?: string | null
  restageSegmentsDone?: number
  rows: ObisSelectionJobRowPollView[]
  updatedAt: string
  envelope?: RuntimeResponseEnvelope<ReadObisSelectionPayload> | null
}

/** One row from the meter's association object list (current AA). */
export interface DiscoveredObjectRow {
  classId: number
  obis: string
  version: number
  classIdName?: string
  description?: string
  shortName?: number
  error?: string
}

/** Bounded Gurux/Python evidence for association object-list (attr 2) debugging. */
export interface AssociationViewInstrumentation {
  guruxAssociationObjectPythonType?: string
  readAttributeIndex?: number
  objectListSnapshots?: Array<Record<string, unknown>>
  rawObjectListPythonType?: string
  rawObjectListTypeQualname?: string
  rawObjectListReprPreview?: string
  rawObjectListLengthProbe?: Record<string, unknown>
  normalizationDecision?: string
  normalizationInputCount?: number
  normalizationOutputCount?: number
  normalizationDroppedOrFailedCount?: number
  normalizationDropReasonsSample?: Array<Record<string, unknown>>
  associationViewDebugNote?: string
}

/** Snapshot from GET Association LN object-list (attribute 2) via Gurux. */
export interface DiscoverSupportedObisPayload {
  associationLogicalName: string
  totalCount: number
  objects: DiscoveredObjectRow[]
  /** e.g. gurux_association_ln_object_list_attr2 */
  source?: string
  associationViewInstrumentation?: AssociationViewInstrumentation
  /** Honest tag when objects[] is empty (e.g. raw list length zero). */
  catalogIntegrityNote?: string
}

/** File-backed discovery snapshot (Python `DiscoverySnapshotRecord`). */
export interface DiscoverySnapshotRecord {
  schemaVersion: string
  meterId: string
  capturedAtUtc: string
  associationLogicalName: string
  totalCount: number
  objects: DiscoveredObjectRow[]
  source: string
  profileFingerprint: string
  simulated: boolean
  runtimeAdapter: string
  channelContext?: Record<string, unknown>
  discoveryFinishedAt?: string
  associationViewInstrumentation?: Record<string, unknown>
  catalogIntegrityNote?: string
}

export interface DiscoverySnapshotListItem {
  capturedAtUtc: string
  storedAs: string
}

export interface DiscoverySnapshotListResponse {
  meterId: string
  snapshots: DiscoverySnapshotListItem[]
}

/** Result of comparing a read profile to the latest discovery snapshot (Next catalog guard). */
export type CatalogCompatibilityDecision =
  | "allowed"
  | "no_snapshot"
  | "incompatible"

/** Structured diagnostics for catalog-guarded targeted reads (server / internal APIs). */
export interface CatalogReadCompatibilityDiagnostics {
  decision: CatalogCompatibilityDecision
  readProfile: "basic_registers"
  requiredObis: string[]
  /** Required OBIS that appear in the snapshot object list. */
  supportedObisInSnapshot: string[]
  /** Required OBIS not found in the snapshot (empty when decision is no_snapshot). */
  missingObis: string[]
  snapshotSummary: {
    capturedAtUtc: string
    associationLogicalName: string
    totalCount: number
    profileFingerprint: string
    simulated: boolean
  } | null
  message: string
}

export interface RelaySimulatedPayload {
  /**
   * Simulated relay posture for UX/contracts only.
   * Does not reflect a physical disconnector or service switch change.
   */
  simulatedRelayState: "disconnected" | "connected" | "unknown"
  acceptanceNote: string
}

/** Python sidecar / MVP-AMI disconnect-control relay payload (normalized UI state). */
export type RelayUiState = "on" | "off" | "unknown"

export interface RelayControlPayload {
  relayState: RelayUiState
  rawDisplay?: string
  logicalName?: string
  methodExecuted?: number
  /** Semantic profile id from runtime (per-meter overrides via sidecar env). */
  relayProfileId?: string
  /** Which relay command profile selected method indices for this action. */
  relayCommandProfileId?: string
  /** Structured evidence for outputState/controlState interpretation (bounded). */
  relayDiagnostics?: Record<string, unknown>
}
