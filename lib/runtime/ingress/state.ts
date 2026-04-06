import type { IngressSessionClass, MeterIngressPublicStatus } from "@/lib/runtime/ingress/types"
import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"

const DISCLAIMER =
  "Inbound TCP bytes are captured for diagnostics only. Listener activity does not imply verified DLMS association, COSEM reads, or relay execution."

function diagnostics() {
  return getIngressProcessRuntime().diagnostics
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
  s.lastSessionClass = "tcp_connected"
  s.lastBytesReceivedOnLastSession = 0
  s.lastInboundPreviewHex = null
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
    disclaimer: DISCLAIMER,
  }
}
