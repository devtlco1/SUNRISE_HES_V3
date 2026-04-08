/**
 * Persisted connectivity / inbound-session history (Phase 2).
 * Event names are operator-meaningful and stable for filters and dashboards.
 */
export type ConnectivityEventType =
  | "connected"
  | "disconnected"
  | "restored"
  | "auto_bind_success"
  | "auto_bind_failed"
  | "identify_failed"
  | "association_success"
  | "association_failed"
  | "timeout"
  | "read_failed"
  | "relay_failed"

/** All event types (UI filters, API validation). */
export const CONNECTIVITY_EVENT_TYPES_LIST: ConnectivityEventType[] = [
  "connected",
  "disconnected",
  "restored",
  "auto_bind_success",
  "auto_bind_failed",
  "identify_failed",
  "association_success",
  "association_failed",
  "timeout",
  "read_failed",
  "relay_failed",
]

export type ConnectivityEventSeverity = "info" | "warning" | "error"

export type ConnectivityEventRecord = {
  id: string
  /** Registry meter id when known (may be empty for anonymous inbound sockets). */
  meterId: string
  /** Canonical serial when known. */
  meterSerial: string
  eventType: ConnectivityEventType
  severity: ConnectivityEventSeverity
  message: string
  remoteHost: string
  remotePort: number | null
  /** e.g. inbound_tcp, direct_tcp */
  route: string
  createdAt: string
  metadata?: Record<string, unknown>
  /**
   * Internal: suppress duplicate spam when the same outcome is retried (e.g. UI polls).
   * Omitted from public API responses.
   */
  dedupeKey?: string
}

/** Types counted as “failures” for filters and instability heuristics. */
export const CONNECTIVITY_FAILURE_EVENT_TYPES: ReadonlySet<ConnectivityEventType> =
  new Set([
    "disconnected",
    "auto_bind_failed",
    "identify_failed",
    "association_failed",
    "timeout",
    "read_failed",
    "relay_failed",
  ])
