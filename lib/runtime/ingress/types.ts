/**
 * Inbound meter TCP ingress — diagnostics types (UI-agnostic).
 * Classification is observational only until real HDLC/DLMS parsers run on the socket.
 */

import type { GuruxEaFrameDiagnostics } from "@/lib/runtime/real/hdlc-frame-gurux-ea"
import type { OutboundAarqPayloadDiag } from "@/lib/runtime/real/dlms-aarq-diag"

/** Observational session state for an inbound connection (not verified COSEM). */
export type IngressSessionClass =
  | "idle"
  | "tcp_connected"
  | "bytes_received"
  | "hdlc_unclassified"
  | "hdlc_candidate"
  | "dlms_not_verified"
  | "association_not_attempted"
  | "inbound_association_verified"
  | "inbound_identity_read_verified"
  | "inbound_session_failed"

/** One row from post-AARQ AARE hunt (bounded fields; frame hex capped). */
export type IngressAareHuntRowPublic = {
  frameHexCapped: string
  addressModel: string
  destLen: number
  srcLen: number
  payloadByteLength: number
  llcStripped: string
  apduPrefixHex: string
  hasTag61: boolean
  associationResultEnum: number | null
  rowNote: string
}

/** Latest structured AARE search result (updated after each post-AARQ burst). */
export type IngressAareHuntReportPublic = {
  code: string
  summary: string
  completeHdlcFrameCount: number
  iFrameVariantCount: number
  rows: IngressAareHuntRowPublic[]
  /** Accumulator index where post-AARQ RX slice starts; null if full-buffer hunt. */
  postAarqBoundary: number | null
  /** Bytes in slice `accum[boundary..]` when boundary set. */
  rxSliceByteLength: number
}

/** Outbound AARQ payload + HDLC address context (secrets may appear in AC hex). */
export type IngressOutboundAarqDiagPublic = OutboundAarqPayloadDiag & {
  meterAddressHexForIframe: string
  clientAddressHexForIframe: string
}

/** Who ended the inbound TCP session and why (observational). */
export type IngressSocketCloseOrigin =
  | "closed_after_disc_final"
  | "closed_after_post_aarq_timeout"
  | "socket_closed_by_peer"
  | "socket_error_before_close"

/** Timestamps and classification for the meter TCP session teardown. */
export type IngressSocketCloseDiagnosticPublic = {
  closeOrigin: IngressSocketCloseOrigin
  /** ISO time of the last outbound HDLC (or other) frame recorded on the trace. */
  lastOutboundFrameIso: string | null
  lastOutboundFramePhase: string | null
  /** ISO time when a post-AARQ read burst ended on `max_wait_ms` (RX deadline). */
  timeoutExpiryIso: string | null
  /** Phase tag for the read that hit `max_wait_ms` (post-AARQ hunt only when applicable). */
  timeoutExpiryPhase: string | null
  /** ISO time of the TCP `close` event (if observed). */
  socketCloseIso: string | null
  socketCloseHadError: boolean
  /** Whether DISC was written in `finally` (best-effort). */
  discFinalAttempted: boolean
  discFinalIso: string | null
  /** True when a post-AARQ burst returned 0 bytes because `max_wait_ms` fired. */
  postAarqMaxWaitZeroRx: boolean
  /** Meter appeared to close TCP before server began intentional teardown (`finally`). */
  peerClosedBeforeServerTeardown: boolean
  /** First `error` event on the socket during the session, if any. */
  socketErrorIso: string | null
  socketErrorMessage: string | null
  finalizedAtIso: string
  detailNote: string
}

/** Bounded operator-facing summary of how the server built and sent the AARQ HDLC leg. */
export type OutboundAssociationHdlcDiagPublic = {
  uaNegotiatedParseSource: string
  uaNegotiatedMaxInfoTX: number
  uaNegotiatedMaxInfoRX: number
  uaNegotiatedWindowSizeTX: number
  uaNegotiatedWindowSizeRX: number
  uaInformationFieldHexCapped: string | null
  uaNegotiatedParseNote: string
  aarqInitiateProfileLabel: string
  aarqInitiateMaxPduSize: number
  aarqInitiateProposedConformanceHex: string
  aarqHdlcSegmentCount: number
  aarqHdlcMultiSegment: boolean
  aarqHdlcMaxInfoTXUsed: number
  aarqHdlcControlsHex: string[]
  aarqHdlcFormatBytesHex: string[]
  aarqHdlcLengthBytes: number[]
  aarqHdlcPayloadBytesPerSegment: number[]
  hdlcIframeBuilderId: string
  /** One-line pointer to Gurux sources of truth. */
  guruxReferenceNote: string
}

/** Bounded last-session protocol evidence for operator debugging (no secrets). */
export type IngressProtocolTracePublic = {
  startedAtIso: string | null
  steps: Array<{ t: string; phase: string; detail?: string }>
  inboundFrames: Array<{
    t: string
    phase: string
    frameHex: string
    byteLength: number
    formatByte: number | null
    formatNote: string
    lengthByte: number | null
    variants: Array<{
      destLen: number
      srcLen: number
      kind: string
      control: number
      controlLabel: string
      destHex: string
      srcHex: string
      fcsValid: string
      addressModel?: "fixed_width" | "gurux_ea"
      headerFcsEndian?: "le" | "be"
      payloadFcsEndian?: "le" | "be"
    }>
    heuristicUaOffsetsInInner: number[]
    summary: string
    eaGurux: GuruxEaFrameDiagnostics | null
  }>
  outboundFrames: Array<{
    t: string
    phase: string
    frameHex: string
    byteLength: number
  }>
  /** Capped full meter-side accumulation snapshot at last trace update. */
  lastMeterAccumHexCapped: string | null
  /** Bytes before first 0x7E in last accumulation (capped). */
  leadingGarbageHex: string | null
  /** Bytes after last 0x7E when stream does not end on a flag (capped). */
  lastIncompleteTailHex: string | null
  lastUaStrictFound: boolean
  lastUaCandidateSummary: string | null
  lastSnrmStrictSummary: string | null
  lastFrameParseSummary: string
  lastFcsValidationNote: string
  /** Latest one-line AARQ→AARE hunt outcome (code:summary). */
  lastAarqAareSummary: string | null
  /** Per-burst deltas after AARQ until AARE resolved or loop ends (bounded). */
  aarqAareSteps: Array<{
    t: string
    phase: string
    deltaRxBytes: number
    accumTotalBytes: number
    completeHdlcSegments: number
    huntCode: string
    huntSummary: string
    rowCount: number
    postAarqBoundary: number
    rxSliceByteLength: number
  }>
  /** Full latest hunt snapshot (rows capped inside builder). */
  lastAareHuntReport: IngressAareHuntReportPublic | null
  /** Payload breakdown for the last transmitted AARQ I-frame (may embed password in AC TLV hex). */
  lastOutboundAarqDiagnostic: IngressOutboundAarqDiagPublic | null
  /**
   * HDLC association outbound path: UA-negotiated sizes, AARQ initiate profile, Gurux-style
   * segmentation (`getHdlcFrame` / `getLnMessages` behaviour).
   */
  lastOutboundAssociationHdlcDiagnostic: OutboundAssociationHdlcDiagPublic | null
  /** TCP teardown: who closed and key timestamps (last TX, read deadline, socket close). */
  socketCloseDiagnostic: IngressSocketCloseDiagnosticPublic | null
}

/** Evidence-based MVP-AMI vs SUNRISE ingress (static; see `mvp-ami-topology-note.ts`). */
export type IngressMvpAmiTopologyComparisonPublic = {
  transportEquivalenceAssessment: "not_equivalent"
  summary: string
  mvpAmiDocumentedReadPath: string
  mvpAmiTcpListenerPocBehavior: string
  sunriseIngressBehavior: string
  concreteDifferences: string[]
  liveVpsEvidenceAnchor: string
  /**
   * Whether further **inbound TCP ingress** tweaks are still a credible primary bet (VPS evidence may set false).
   */
  associationAssumptionStillWorthTesting: boolean
  recommendedNextDirection: string
}

/**
 * How inbound TCP sockets run the DLMS experiment after accept.
 * - `auto_associate_on_accept`: legacy SUNRISE behavior (read first, then HDLC/DLMS).
 * - `staged_triggered_session`: hold socket until `POST .../start-session` (MVP-AMI TCP POC–style ordering).
 */
export type IngressTcpSessionMode = "auto_associate_on_accept" | "staged_triggered_session"

/** Operator-facing snapshot of the staged-socket experiment (no secrets). */
export type StagedIngressExperimentPublic = {
  /** True when a non-destroyed staged socket is registered. */
  stagedSocketPresent: boolean
  stagedRemoteAddress: string | null
  stagedRemotePort: number | null
  stagedAcceptedAtIso: string | null
  stagedSocketOpen: boolean
  /** Last time an older staged socket was replaced (ISO), if any. */
  lastStagedReplacementAtIso: string | null
  lastStagedReplacementReason: string | null
  startSessionInvokeTotal: number
  /** True while `POST .../start-session` is running DLMS on the staged socket. */
  startSessionInProgress: boolean
  lastStartSessionInvokedAtIso: string | null
  lastStartSessionFinishedAtIso: string | null
  /** `ok` | `error` | `no_staged_socket` | `busy` | `profile_invalid` | `idle` (never invoked). */
  lastStartSessionResult: string
  lastStartSessionError: string | null
  lastTriggerIecAttempted: boolean
  lastTriggerIecSkippedReason: string | null
  lastTriggerAckSent: boolean
  lastTriggerAckHexChosen: string | null
  lastTriggerAckSkippedReason: string | null
  lastTriggerDelayMs: number | null
  lastTriggerDelayCompleted: boolean
  lastTriggerDlmsAssociationStarted: boolean
  lastTriggerAssociationAttempted: boolean
  lastTriggerIdentityReadAttempted: boolean
  /** Compact ordered steps from the last triggered run (VPS-friendly). */
  lastTriggerTraceSteps: string[]
}

export type MeterIngressConfig = {
  enabled: boolean
  host: string
  port: number
  socketTimeoutSeconds: number
  /** True when env shape is valid for starting a listener (may still fail to bind). */
  valid: boolean
  configError: string | null
  /** Session runner timing model (default: auto on accept). */
  sessionMode: IngressTcpSessionMode
  sessionModeConfigError: string | null
}

export type MeterIngressPublicStatus = {
  /** Inbound listener feature enabled via env. */
  ingressEnabled: boolean
  /** TCP ingress DLMS trigger model (`RUNTIME_TCP_METER_INGRESS_SESSION_MODE`). */
  ingressSessionMode: IngressTcpSessionMode
  /** Non-null when session mode env is invalid (listener may still run in a safe default). */
  ingressSessionModeConfigError: string | null
  /** Env valid and listener was started (may not be listening if bind failed). */
  listenerAttempted: boolean
  listening: boolean
  bindHost: string
  bindPort: number
  socketTimeoutSeconds: number
  startedAtIso: string | null
  listenError: string | null
  totalConnectionsAccepted: number
  activeConnections: number
  lastConnectionAtIso: string | null
  lastRemoteAddress: string | null
  lastRemotePort: number | null
  lastBytesReceivedOnLastSession: number
  lastSessionClass: IngressSessionClass
  lastIngressError: string | null
  /** Hex preview of first captured bytes on last session (capped); null if none. */
  lastInboundPreviewHex: string | null
  /** Inbound DLMS session runner enabled (env); false if disabled or ingress off. */
  inboundDlmsSessionEnabled: boolean
  inboundProtocolProfileValid: boolean
  inboundProtocolProfileError: string | null
  inboundAuthMode: string
  lastInboundProtocolPhase: string
  inboundAssociationAttempted: boolean
  inboundAssociationVerifiedOnWire: boolean
  inboundAssociationResultEnum: number | null
  /** Truncated AARE APDU hex when association was parsed (diagnostics). */
  inboundAareApduHex: string | null
  inboundIdentityReadAttempted: boolean
  inboundIdentityReadVerifiedOnWire: boolean
  inboundIdentityValueHex: string | null
  inboundLastProtocolDetail: string
  /** Last inbound DLMS session protocol trace (bounded; meter->server / server->meter). */
  inboundProtocolTrace: IngressProtocolTracePublic | null
  /** MVP-AMI repository transport/session comparison (architecture; not live socket-derived). */
  mvpAmiTopologyComparison: IngressMvpAmiTopologyComparisonPublic
  /** Present when mode is `staged_triggered_session` (experiment diagnostics). */
  stagedIngressExperiment: StagedIngressExperimentPublic | null
  disclaimer: string
}
