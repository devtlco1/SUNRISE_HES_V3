import type { IngressSessionClass, MeterIngressPublicStatus } from "@/lib/runtime/ingress/types"
import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"

const DISCLAIMER =
  "TCP accept and byte counts are transport-level. Association and identity fields are true only when parsed on-wire (HDLC FCS, AARE result, GET-Response). Inbound success does not imply relay or other COSEM operations."

function diagnostics() {
  return getIngressProcessRuntime().diagnostics
}

function resetLastSessionProtocolFields(): void {
  const s = diagnostics()
  s.lastBytesReceivedOnLastSession = 0
  s.lastSessionClass = "tcp_connected"
  s.lastInboundPreviewHex = null
  s.lastInboundProtocolPhase = "connected"
  s.inboundAssociationAttempted = false
  s.inboundAssociationVerifiedOnWire = false
  s.inboundAssociationResultEnum = null
  s.inboundAareApduHex = null
  s.inboundIdentityReadAttempted = false
  s.inboundIdentityReadVerifiedOnWire = false
  s.inboundIdentityValueHex = null
  s.inboundLastProtocolDetail = ""
}

export function resetIngressStateForTestsOnly(): void {
  const d = diagnostics()
  Object.assign(d, {
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
    lastSessionClass: "idle" as IngressSessionClass,
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
  })
}

export function markListenerConfigured(params: {
  bindHost: string
  bindPort: number
  socketTimeoutSeconds: number
}): void {
  const s = diagnostics()
  s.listenerAttempted = true
  s.bindHost = params.bindHost
  s.bindPort = params.bindPort
  s.socketTimeoutSeconds = params.socketTimeoutSeconds
}

export function markListening(startedAt: Date): void {
  const s = diagnostics()
  s.listening = true
  s.listenError = null
  s.startedAtIso = startedAt.toISOString()
}

export function markListenFailed(message: string): void {
  const s = diagnostics()
  s.listening = false
  s.listenError = message
}

export function markListenerStopped(): void {
  diagnostics().listening = false
}

export function onConnectionAccepted(remoteAddress: string, remotePort: number): void {
  const s = diagnostics()
  s.totalConnectionsAccepted += 1
  s.activeConnections += 1
  s.lastConnectionAtIso = new Date().toISOString()
  s.lastRemoteAddress = remoteAddress
  s.lastRemotePort = remotePort
  resetLastSessionProtocolFields()
}

export function onConnectionClosed(): void {
  const s = diagnostics()
  s.activeConnections = Math.max(0, s.activeConnections - 1)
}

export function onSessionData(
  byteLength: number,
  preview: Buffer,
  sessionClass: IngressSessionClass
): void {
  const s = diagnostics()
  s.lastBytesReceivedOnLastSession = byteLength
  s.lastSessionClass = sessionClass
  s.lastInboundPreviewHex =
    preview.length > 0 ? preview.subarray(0, 128).toString("hex") : null
}

export function onIngressError(message: string): void {
  diagnostics().lastIngressError = message
}

export function applyInboundProfileDiagnostics(params: {
  sessionEnabled: boolean
  profileValid: boolean
  profileError: string | null
  authMode: string
}): void {
  const s = diagnostics()
  s.inboundDlmsSessionEnabled = params.sessionEnabled
  s.inboundProtocolProfileValid = params.profileValid
  s.inboundProtocolProfileError = params.profileError
  s.inboundAuthMode = params.authMode
}

export function setInboundProtocolPhase(phase: string, detail?: string): void {
  const s = diagnostics()
  s.lastInboundProtocolPhase = phase
  if (detail !== undefined) s.inboundLastProtocolDetail = detail
}

export function setInboundAssociationOutcome(params: {
  attempted: boolean
  verifiedOnWire: boolean
  resultEnum: number | null
  aareApduHex: string | null
}): void {
  const s = diagnostics()
  s.inboundAssociationAttempted = params.attempted
  s.inboundAssociationVerifiedOnWire = params.verifiedOnWire
  s.inboundAssociationResultEnum = params.resultEnum
  s.inboundAareApduHex = params.aareApduHex
}

export function setInboundIdentityOutcome(params: {
  attempted: boolean
  verifiedOnWire: boolean
  valueHex: string | null
}): void {
  const s = diagnostics()
  s.inboundIdentityReadAttempted = params.attempted
  s.inboundIdentityReadVerifiedOnWire = params.verifiedOnWire
  s.inboundIdentityValueHex = params.valueHex
}

export function getMeterIngressPublicStatus(
  ingressEnabledFromEnv: boolean
): MeterIngressPublicStatus {
  const s = diagnostics()
  return {
    ingressEnabled: ingressEnabledFromEnv,
    listenerAttempted: s.listenerAttempted,
    listening: s.listening,
    bindHost: s.bindHost,
    bindPort: s.bindPort,
    socketTimeoutSeconds: s.socketTimeoutSeconds,
    startedAtIso: s.startedAtIso,
    listenError: s.listenError,
    totalConnectionsAccepted: s.totalConnectionsAccepted,
    activeConnections: s.activeConnections,
    lastConnectionAtIso: s.lastConnectionAtIso,
    lastRemoteAddress: s.lastRemoteAddress,
    lastRemotePort: s.lastRemotePort,
    lastBytesReceivedOnLastSession: s.lastBytesReceivedOnLastSession,
    lastSessionClass: s.lastSessionClass,
    lastIngressError: s.lastIngressError,
    lastInboundPreviewHex: s.lastInboundPreviewHex,
    inboundDlmsSessionEnabled: s.inboundDlmsSessionEnabled,
    inboundProtocolProfileValid: s.inboundProtocolProfileValid,
    inboundProtocolProfileError: s.inboundProtocolProfileError,
    inboundAuthMode: s.inboundAuthMode,
    lastInboundProtocolPhase: s.lastInboundProtocolPhase,
    inboundAssociationAttempted: s.inboundAssociationAttempted,
    inboundAssociationVerifiedOnWire: s.inboundAssociationVerifiedOnWire,
    inboundAssociationResultEnum: s.inboundAssociationResultEnum,
    inboundAareApduHex: s.inboundAareApduHex,
    inboundIdentityReadAttempted: s.inboundIdentityReadAttempted,
    inboundIdentityReadVerifiedOnWire: s.inboundIdentityReadVerifiedOnWire,
    inboundIdentityValueHex: s.inboundIdentityValueHex,
    inboundLastProtocolDetail: s.inboundLastProtocolDetail,
    disclaimer: DISCLAIMER,
  }
}
