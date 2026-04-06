import net from "node:net"

import { classifyInboundPreview } from "@/lib/runtime/ingress/classify"
import { runInboundDlmsOnSocket } from "@/lib/runtime/ingress/inbound-dlms-session"
import { loadInboundMeterProtocolProfile } from "@/lib/runtime/ingress/inbound-profile"
import { loadMeterIngressConfig } from "@/lib/runtime/ingress/config"
import { stashStagedMeterSocket } from "@/lib/runtime/ingress/staged-socket"
import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"
import {
  applyInboundProfileDiagnostics,
  markListenFailed,
  markListenerConfigured,
  markListenerStopped,
  markListening,
  onConnectionAccepted,
  onConnectionClosed,
  onIngressError,
  onSessionData,
} from "@/lib/runtime/ingress/state"

const MAX_PREVIEW = 512
const LOG_PREFIX = "[meter-ingress]"

function remoteKey(socket: net.Socket): { address: string; port: number } {
  const a = socket.remoteAddress ?? "unknown"
  const p = socket.remotePort ?? 0
  return { address: a, port: p }
}

function attachPassivePreview(socket: net.Socket, socketTimeoutMs: number, address: string, port: number): void {
  let received = 0
  let previewBuf = Buffer.alloc(0)

  socket.setTimeout(socketTimeoutMs, () => {
    console.warn(`${LOG_PREFIX} socket idle timeout ${address}:${port}`)
    onIngressError(`socket_timeout ${address}:${port}`)
    socket.destroy()
  })

  socket.on("data", (chunk: Buffer) => {
    received += chunk.length
    if (previewBuf.length < MAX_PREVIEW) {
      const room = MAX_PREVIEW - previewBuf.length
      previewBuf = Buffer.concat([
        previewBuf,
        chunk.subarray(0, Math.min(chunk.length, room)),
      ])
    }
    const heur = classifyInboundPreview(previewBuf)
    const sessionClass = heur === "hdlc_candidate" ? "dlms_not_verified" : heur
    onSessionData(received, previewBuf, sessionClass)
  })

  socket.on("error", (err) => {
    console.warn(`${LOG_PREFIX} socket error ${address}:${port}`, err.message)
    onIngressError(`socket_error ${address}:${port}: ${err.message}`)
  })

  socket.on("close", () => {
    onConnectionClosed()
    console.info(`${LOG_PREFIX} closed ${address}:${port} bytes=${received}`)
  })
}

function handleMeterSocket(
  socket: net.Socket,
  socketTimeoutMs: number,
  ingressCfg: ReturnType<typeof loadMeterIngressConfig>
): void {
  const { address, port } = remoteKey(socket)
  onConnectionAccepted(address, port)
  console.info(`${LOG_PREFIX} accepted ${address}:${port}`)

  const profile = loadInboundMeterProtocolProfile()
  applyInboundProfileDiagnostics({
    sessionEnabled: profile.sessionEnabled,
    profileValid: profile.valid,
    profileError: profile.configError,
    authMode: profile.auth,
  })

  if (
    profile.sessionEnabled &&
    profile.valid &&
    ingressCfg.sessionMode === "staged_triggered_session"
  ) {
    stashStagedMeterSocket(socket, socketTimeoutMs)
    return
  }

  if (profile.sessionEnabled && profile.valid) {
    let closeAccounted = false
    const finish = () => {
      if (closeAccounted) return
      closeAccounted = true
      onConnectionClosed()
      console.info(`${LOG_PREFIX} closed ${address}:${port}`)
    }
    socket.on("error", (err) => {
      console.warn(`${LOG_PREFIX} socket error ${address}:${port}`, err.message)
      onIngressError(`socket_error ${address}:${port}: ${err.message}`)
      finish()
    })
    socket.on("close", finish)
    void runInboundDlmsOnSocket(socket, profile).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`${LOG_PREFIX} inbound session error ${address}:${port}`, msg)
      onIngressError(`inbound_session_async: ${msg}`)
      if (!socket.destroyed) socket.destroy()
    })
    return
  }

  if (profile.sessionEnabled && !profile.valid) {
    console.warn(`${LOG_PREFIX} inbound profile invalid: ${profile.configError}`)
    onIngressError(profile.configError ?? "inbound_profile_invalid")
  }

  attachPassivePreview(socket, socketTimeoutMs, address, port)
}

export function startMeterTcpIngress(): void {
  const cfg = loadMeterIngressConfig()
  if (!cfg.enabled) {
    console.info(`${LOG_PREFIX} disabled (RUNTIME_TCP_METER_INGRESS_ENABLED not set)`)
    return
  }
  if (!cfg.valid) {
    console.error(`${LOG_PREFIX} invalid config: ${cfg.configError}`)
    markListenerConfigured({
      bindHost: cfg.host,
      bindPort: cfg.port,
      socketTimeoutSeconds: cfg.socketTimeoutSeconds,
    })
    markListenFailed(cfg.configError ?? "invalid_config")
    return
  }

  const rt = getIngressProcessRuntime()
  if (rt.tcpServer?.listening) {
    console.warn(`${LOG_PREFIX} already listening`)
    return
  }

  markListenerConfigured({
    bindHost: cfg.host,
    bindPort: cfg.port,
    socketTimeoutSeconds: cfg.socketTimeoutSeconds,
  })

  const socketTimeoutMs = cfg.socketTimeoutSeconds * 1000

  const server = net.createServer((socket) => {
    handleMeterSocket(socket, socketTimeoutMs, cfg)
  })

  server.on("error", (err) => {
    console.error(`${LOG_PREFIX} server error`, err)
    markListenFailed(err.message)
    onIngressError(`server_error: ${err.message}`)
    if (rt.tcpServer === server) rt.tcpServer = null
  })

  server.listen(cfg.port, cfg.host, () => {
    markListening(new Date())
    const addr = server.address()
    console.info(
      `${LOG_PREFIX} listening ${typeof addr === "object" && addr ? `${addr.address}:${addr.port}` : cfg.host + ":" + cfg.port}`
    )
  })

  rt.tcpServer = server

  const shutdown = () => {
    if (!rt.tcpServer) return
    markListenerStopped()
    rt.tcpServer.close(() => {
      console.info(`${LOG_PREFIX} listener closed`)
    })
    rt.tcpServer = null
  }

  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

export function bootstrapMeterIngressOnce(): void {
  const rt = getIngressProcessRuntime()
  if (rt.bootstrapInvoked) return
  rt.bootstrapInvoked = true
  try {
    startMeterTcpIngress()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`${LOG_PREFIX} bootstrap failed`, msg)
    markListenFailed(msg)
  }
}
