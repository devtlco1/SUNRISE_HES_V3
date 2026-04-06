import net from "node:net"

/**
 * Open TCP, run `fn`, always `destroy()` the socket in `finally`.
 */
export async function withTcpSocket<T>(
  host: string,
  port: number,
  connectTimeoutMs: number,
  fn: (socket: net.Socket) => Promise<T>
): Promise<T> {
  const socket = new net.Socket()
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        socket.destroy()
        reject(new Error(`TCP connect timed out after ${connectTimeoutMs}ms`))
      }, connectTimeoutMs)
      socket.once("connect", () => {
        clearTimeout(t)
        resolve()
      })
      socket.once("error", (e) => {
        clearTimeout(t)
        reject(e)
      })
      socket.connect(port, host)
    })
    return await fn(socket)
  } finally {
    if (!socket.destroyed) socket.destroy()
  }
}

export type SocketBurstEndReason = "max_wait_ms" | "idle_ms"

export type SocketBurstResult = {
  data: Buffer
  endReason: SocketBurstEndReason
}

/**
 * Accumulate socket data until `idleMs` passes with no new bytes, or `maxWaitMs` elapses.
 * `endReason` is which timer fired last (`max_wait_ms` = overall deadline, `idle_ms` = quiet period).
 */
export function readSocketBurstWithReason(
  socket: net.Socket,
  maxWaitMs: number,
  idleMs: number
): Promise<SocketBurstResult> {
  const chunks: Buffer[] = []
  return new Promise((resolve) => {
    let idleTimer: NodeJS.Timeout | undefined
    let endedBy: SocketBurstEndReason = "idle_ms"
    function done() {
      socket.off("data", onData)
      if (idleTimer) clearTimeout(idleTimer)
      clearTimeout(maxTimer)
      resolve({ data: Buffer.concat(chunks), endReason: endedBy })
    }
    const maxTimer = setTimeout(() => {
      endedBy = "max_wait_ms"
      done()
    }, maxWaitMs)
    function bumpIdle() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        endedBy = "idle_ms"
        done()
      }, idleMs)
    }
    function onData(b: Buffer) {
      chunks.push(b)
      bumpIdle()
    }
    socket.on("data", onData)
    bumpIdle()
  })
}

/**
 * Accumulate socket data until `idleMs` passes with no new bytes, or `maxWaitMs` elapses.
 */
export function readSocketBurst(
  socket: net.Socket,
  maxWaitMs: number,
  idleMs: number
): Promise<Buffer> {
  return readSocketBurstWithReason(socket, maxWaitMs, idleMs).then((r) => r.data)
}

export function writeAll(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}
