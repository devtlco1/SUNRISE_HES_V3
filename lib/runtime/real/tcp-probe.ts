import net from "node:net"

import {
  REAL_PROBE_TCP_ERROR,
  REAL_PROBE_TCP_HOST_NOT_FOUND,
  REAL_PROBE_TCP_REFUSED,
  REAL_PROBE_TCP_TIMEOUT,
} from "@/lib/runtime/real/real-adapter-codes"

export type TcpProbeResult =
  | { ok: true; roundTripMs: number }
  | {
      ok: false
      code: string
      message: string
      roundTripMs?: number
    }

/**
 * Opens a TCP connection to host:port, then closes immediately.
 * Does not speak DLMS/HDLC; success is only socket-level reachability.
 */
export function tcpConnectProbe(
  host: string,
  port: number,
  timeoutMs: number
): Promise<TcpProbeResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    let settled = false
    const socket = new net.Socket()

    const finish = (result: TcpProbeResult) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      if (!socket.destroyed) socket.destroy()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({
        ok: false,
        code: REAL_PROBE_TCP_TIMEOUT,
        message: `TCP connect timed out after ${timeoutMs}ms to ${host}:${port}.`,
        roundTripMs: Date.now() - started,
      })
    }, timeoutMs)

    socket.once("connect", () => {
      clearTimeout(timer)
      const roundTripMs = Date.now() - started
      socket.end()
      finish({ ok: true, roundTripMs })
    })

    socket.once("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      const roundTripMs = Date.now() - started
      const code = mapSocketErrorCode(err)
      finish({
        ok: false,
        code,
        message: err.message || code,
        roundTripMs,
      })
    })

    socket.connect(port, host)
  })
}

function mapSocketErrorCode(err: NodeJS.ErrnoException): string {
  if (err.code === "ECONNREFUSED") return REAL_PROBE_TCP_REFUSED
  if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN")
    return REAL_PROBE_TCP_HOST_NOT_FOUND
  return REAL_PROBE_TCP_ERROR
}
