/**
 * Inbound meter TCP ingress — diagnostics types (UI-agnostic).
 * Classification is observational only until real HDLC/DLMS parsers run on the socket.
 */

/** Observational session state for an inbound connection (not verified COSEM). */
export type IngressSessionClass =
  | "idle"
  | "tcp_connected"
  | "bytes_received"
  | "hdlc_unclassified"
  | "hdlc_candidate"
  | "dlms_not_verified"
  | "association_not_attempted"

export type MeterIngressConfig = {
  enabled: boolean
  host: string
  port: number
  socketTimeoutSeconds: number
  /** True when env shape is valid for starting a listener (may still fail to bind). */
  valid: boolean
  configError: string | null
}

export type MeterIngressPublicStatus = {
  /** Inbound listener feature enabled via env. */
  ingressEnabled: boolean
  /** Env valid and listener was started (may not be listening if bind failed). */
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
  /** Hex preview of first captured bytes on last session (capped); null if none. */
  lastInboundPreviewHex: string | null
  disclaimer: string
}
