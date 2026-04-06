import type net from "node:net"

/**
 * Future handoff: attach HDLC framing / DLMS session / association on this socket.
 * The live inbound pipeline is started from `listener.ts` via `runInboundDlmsOnSocket`
 * when the protocol profile is valid; this symbol remains the documented extension point.
 */
export type InboundMeterSocket = net.Socket

export function handoffInboundMeterSocketForFutureDlms(socket: InboundMeterSocket): void {
  void socket
}
