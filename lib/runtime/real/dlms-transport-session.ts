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

/**
 * Accumulate socket data until `idleMs` passes with no new bytes, or `maxWaitMs` elapses.
 */
export function readSocketBurst(
  socket: net.Socket,
  maxWaitMs: number,
  idleMs: number
): Promise<Buffer> {
  const chunks: Buffer[] = []
  return new Promise((resolve) => {
    let idleTimer: NodeJS.Timeout | undefined
    function done() {
      socket.off("data", onData)
      if (idleTimer) clearTimeout(idleTimer)
      clearTimeout(maxTimer)
      resolve(Buffer.concat(chunks))
    }
    const maxTimer = setTimeout(done, maxWaitMs)
    function bumpIdle() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(done, idleMs)
    }
    function onData(b: Buffer) {
      chunks.push(b)
      bumpIdle()
    }
    socket.on("data", onData)
    bumpIdle()
  })
}

export function writeAll(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}
