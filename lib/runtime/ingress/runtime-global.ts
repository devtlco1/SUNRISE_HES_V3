import type net from "node:net"

import type { IngressProtocolTracePublic, IngressSessionClass } from "@/lib/runtime/ingress/types"

const KEY = "__sunriseHesMeterIngressRuntime" as const

export type IngressDiagnosticsState = {
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
  lastInboundPreviewHex: string | null
  /** Whether inbound DLMS session machine is enabled (env) for the last profile evaluation. */
  inboundDlmsSessionEnabled: boolean
  inboundProtocolProfileValid: boolean
  inboundProtocolProfileError: string | null
  inboundAuthMode: string
  lastInboundProtocolPhase: string
  inboundAssociationAttempted: boolean
  inboundAssociationVerifiedOnWire: boolean
  inboundAssociationResultEnum: number | null
  inboundAareApduHex: string | null
  inboundIdentityReadAttempted: boolean
  inboundIdentityReadVerifiedOnWire: boolean
  inboundIdentityValueHex: string | null
  inboundLastProtocolDetail: string
  inboundProtocolTrace: IngressProtocolTracePublic | null
}

/** Mutable staged-socket experiment (single slot). Socket lives here, not in diagnostics JSON. */
export type StagedIngressRuntimeState = {
  socket: net.Socket | null
  remoteAddress: string | null
  remotePort: number | null
  acceptedAtIso: string | null
  lastReplacementAtIso: string | null
  lastReplacementReason: string | null
  startSessionInvokeTotal: number
  lastInvokedAtIso: string | null
  lastFinishedAtIso: string | null
  lastResult: string
  lastError: string | null
  lastIecAttempted: boolean
  lastIecSkippedReason: string | null
  lastAckSent: boolean
  lastAckHexChosen: string | null
  lastAckSkippedReason: string | null
  lastDelayMs: number | null
  lastDelayCompleted: boolean
  lastDlmsAssociationStarted: boolean
  lastAssociationAttempted: boolean
  lastIdentityReadAttempted: boolean
  lastTriggerTraceSteps: string[]
  triggerInProgress: boolean
}

function createInitialStagedState(): StagedIngressRuntimeState {
  return {
    socket: null,
    remoteAddress: null,
    remotePort: null,
    acceptedAtIso: null,
    lastReplacementAtIso: null,
    lastReplacementReason: null,
    startSessionInvokeTotal: 0,
    lastInvokedAtIso: null,
    lastFinishedAtIso: null,
    lastResult: "idle",
    lastError: null,
    lastIecAttempted: false,
    lastIecSkippedReason: null,
    lastAckSent: false,
    lastAckHexChosen: null,
    lastAckSkippedReason: null,
    lastDelayMs: null,
    lastDelayCompleted: false,
    lastDlmsAssociationStarted: false,
    lastAssociationAttempted: false,
    lastIdentityReadAttempted: false,
    lastTriggerTraceSteps: [],
    triggerInProgress: false,
  }
}

export type IngressProcessRuntime = {
  diagnostics: IngressDiagnosticsState
  tcpServer: net.Server | null
  bootstrapInvoked: boolean
  staged: StagedIngressRuntimeState
}

function createInitialDiagnostics(): IngressDiagnosticsState {
  return {
    listenerAttempted: false,
    listening: false,
    bindHost: "",
    bindPort: 0,
    socketTimeoutSeconds: 120,
    startedAtIso: null,
    listenError: null,
    totalConnectionsAccepted: 0,
    activeConnections: 0,
    lastConnectionAtIso: null,
    lastRemoteAddress: null,
    lastRemotePort: null,
    lastBytesReceivedOnLastSession: 0,
    lastSessionClass: "idle",
    lastIngressError: null,
    lastInboundPreviewHex: null,
    inboundDlmsSessionEnabled: false,
    inboundProtocolProfileValid: true,
    inboundProtocolProfileError: null,
    inboundAuthMode: "LOW",
    lastInboundProtocolPhase: "idle",
    inboundAssociationAttempted: false,
    inboundAssociationVerifiedOnWire: false,
    inboundAssociationResultEnum: null,
    inboundAareApduHex: null,
    inboundIdentityReadAttempted: false,
    inboundIdentityReadVerifiedOnWire: false,
    inboundIdentityValueHex: null,
    inboundLastProtocolDetail: "",
    inboundProtocolTrace: null,
  }
}

/**
 * Next.js may load instrumentation and route handlers as separate bundles; a normal
 * module-level singleton would diverge. One object on globalThis keeps diagnostics
 * aligned with the real TCP listener in a single OS process.
 */
export function getIngressProcessRuntime(): IngressProcessRuntime {
  const g = globalThis as typeof globalThis & {
    [KEY]?: IngressProcessRuntime
  }
  if (!g[KEY]) {
    g[KEY] = {
      diagnostics: createInitialDiagnostics(),
      tcpServer: null,
      bootstrapInvoked: false,
      staged: createInitialStagedState(),
    }
  }
  return g[KEY]
}
