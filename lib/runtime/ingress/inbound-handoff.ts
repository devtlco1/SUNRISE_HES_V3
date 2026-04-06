import type net from "node:net"

/**
 * Future handoff: attach HDLC framing / DLMS session / association on this socket.
 * Inbound path is meter-initiated; this module is the deliberate extension point.
 */
export type InboundMeterSocket = net.Socket

export function handoffInboundMeterSocketForFutureDlms(socket: InboundMeterSocket): void {
  void socket
  // Intentionally empty: ingress captures bytes and classifies heuristics only.
}
