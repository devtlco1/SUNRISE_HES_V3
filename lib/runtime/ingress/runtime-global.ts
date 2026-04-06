import type net from "node:net"

import type { IngressSessionClass } from "@/lib/runtime/ingress/types"

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
}

export type IngressProcessRuntime = {
  diagnostics: IngressDiagnosticsState
  tcpServer: net.Server | null
  bootstrapInvoked: boolean
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
    }
  }
  return g[KEY]
}
