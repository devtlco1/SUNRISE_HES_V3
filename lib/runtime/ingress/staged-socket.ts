import type net from "node:net"

import { traceProtocolStep } from "@/lib/runtime/ingress/protocol-trace"
import {
  getIngressProcessRuntime,
  type StagedIngressRuntimeState,
} from "@/lib/runtime/ingress/runtime-global"

const LOG_PREFIX = "[meter-ingress]"

function recordStagedIngressError(message: string): void {
  getIngressProcessRuntime().diagnostics.lastIngressError = message
}

function recordStagedConnectionClosed(): void {
  const s = getIngressProcessRuntime().diagnostics
  s.activeConnections = Math.max(0, s.activeConnections - 1)
}

function remoteOf(socket: net.Socket): { address: string; port: number } {
  return {
    address: socket.remoteAddress ?? "unknown",
    port: socket.remotePort ?? 0,
  }
}

/** Reset per-trigger fields before a new `start-session` run. */
const MAX_STAGED_TRIGGER_TRACE_STEPS = 48

export function appendStagedTriggerTrace(st: StagedIngressRuntimeState, phase: string): void {
  const line = `${new Date().toISOString()} ${phase}`
  st.lastTriggerTraceSteps.push(line)
  while (st.lastTriggerTraceSteps.length > MAX_STAGED_TRIGGER_TRACE_STEPS) {
    st.lastTriggerTraceSteps.shift()
  }
}

export function resetStagedTriggerResultFields(st: StagedIngressRuntimeState): void {
  st.lastError = null
  st.lastIecAttempted = false
  st.lastIecSkippedReason = null
  st.lastAckSent = false
  st.lastAckHexChosen = null
  st.lastAckSkippedReason = null
  st.lastDelayMs = null
  st.lastDelayCompleted = false
  st.lastDlmsAssociationStarted = false
  st.lastAssociationAttempted = false
  st.lastIdentityReadAttempted = false
  st.lastTriggerTraceSteps = []
}

/**
 * Replace any existing staged socket with this new connection. Does not start DLMS.
 */
export function stashStagedMeterSocket(socket: net.Socket, socketTimeoutMs: number): void {
  const rt = getIngressProcessRuntime()
  const st = rt.staged
  const { address, port } = remoteOf(socket)

  if (st.socket && !st.socket.destroyed) {
    const prev = remoteOf(st.socket)
    st.lastReplacementAtIso = new Date().toISOString()
    st.lastReplacementReason = `replaced_by_new_connection from ${address}:${port} (previous ${prev.address}:${prev.port})`
    traceProtocolStep("staged_socket_replaced", st.lastReplacementReason)
    console.warn(`${LOG_PREFIX} staged socket replaced ${prev.address}:${prev.port} -> ${address}:${port}`)
    try {
      st.socket.removeAllListeners()
      st.socket.destroy()
    } catch {
      /* ignore */
    }
    recordStagedConnectionClosed()
  }

  st.socket = socket
  st.remoteAddress = address
  st.remotePort = port
  st.acceptedAtIso = new Date().toISOString()

  socket.setTimeout(socketTimeoutMs, () => {
    if (rt.staged.socket !== socket) return
    console.warn(`${LOG_PREFIX} staged socket idle timeout ${address}:${port}`)
    recordStagedIngressError(`staged_socket_timeout ${address}:${port}`)
    traceProtocolStep("staged_socket_idle_timeout", `${address}:${port}`)
    try {
      socket.destroy()
    } catch {
      /* ignore */
    }
  })

  socket.on("error", (err) => {
    if (rt.staged.socket !== socket) return
    console.warn(`${LOG_PREFIX} staged socket error ${address}:${port}`, err.message)
    recordStagedIngressError(`staged_socket_error ${address}:${port}: ${err.message}`)
    traceProtocolStep("staged_socket_error", err.message)
  })

  socket.on("close", () => {
    if (rt.staged.socket !== socket) return
    traceProtocolStep("staged_socket_closed", `${address}:${port}`)
    rt.staged.socket = null
    recordStagedConnectionClosed()
    console.info(`${LOG_PREFIX} staged socket closed ${address}:${port}`)
  })

  traceProtocolStep("staged_socket_accepted_and_held", `${address}:${port}`)
  console.info(`${LOG_PREFIX} staged (held) ${address}:${port}`)
}
