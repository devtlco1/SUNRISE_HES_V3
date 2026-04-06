import type { IngressSessionClass, MeterIngressPublicStatus } from "@/lib/runtime/ingress/types"

const DISCLAIMER =
  "Inbound TCP bytes are captured for diagnostics only. Listener activity does not imply verified DLMS association, COSEM reads, or relay execution."

type MutableIngressState = {
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
}

const state: MutableIngressState = {
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
}

export function resetIngressStateForTestsOnly(): void {
  Object.assign(state, {
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
  state.listenerAttempted = true
  state.bindHost = params.bindHost
  state.bindPort = params.bindPort
  state.socketTimeoutSeconds = params.socketTimeoutSeconds
}

export function markListening(startedAt: Date): void {
  state.listening = true
  state.listenError = null
  state.startedAtIso = startedAt.toISOString()
}

export function markListenFailed(message: string): void {
  state.listening = false
  state.listenError = message
}

export function markListenerStopped(): void {
  state.listening = false
}

export function onConnectionAccepted(remoteAddress: string, remotePort: number): void {
  state.totalConnectionsAccepted += 1
  state.activeConnections += 1
  state.lastConnectionAtIso = new Date().toISOString()
  state.lastRemoteAddress = remoteAddress
  state.lastRemotePort = remotePort
  state.lastSessionClass = "tcp_connected"
  state.lastBytesReceivedOnLastSession = 0
  state.lastInboundPreviewHex = null
}

export function onConnectionClosed(): void {
  state.activeConnections = Math.max(0, state.activeConnections - 1)
}

export function onSessionData(
  byteLength: number,
  preview: Buffer,
  sessionClass: IngressSessionClass
): void {
  state.lastBytesReceivedOnLastSession = byteLength
  state.lastSessionClass = sessionClass
  state.lastInboundPreviewHex =
    preview.length > 0 ? preview.subarray(0, 128).toString("hex") : null
}

export function onIngressError(message: string): void {
  state.lastIngressError = message
}

export function getMeterIngressPublicStatus(
  ingressEnabledFromEnv: boolean
): MeterIngressPublicStatus {
  return {
    ingressEnabled: ingressEnabledFromEnv,
    listenerAttempted: state.listenerAttempted,
    listening: state.listening,
    bindHost: state.bindHost,
    bindPort: state.bindPort,
    socketTimeoutSeconds: state.socketTimeoutSeconds,
    startedAtIso: state.startedAtIso,
    listenError: state.listenError,
    totalConnectionsAccepted: state.totalConnectionsAccepted,
    activeConnections: state.activeConnections,
    lastConnectionAtIso: state.lastConnectionAtIso,
    lastRemoteAddress: state.lastRemoteAddress,
    lastRemotePort: state.lastRemotePort,
    lastBytesReceivedOnLastSession: state.lastBytesReceivedOnLastSession,
    lastSessionClass: state.lastSessionClass,
    lastIngressError: state.lastIngressError,
    lastInboundPreviewHex: state.lastInboundPreviewHex,
    disclaimer: DISCLAIMER,
  }
}
