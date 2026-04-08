import type { ConnectivityEventRecord } from "@/types/connectivity-events"
import type { MeterCommStatus } from "@/types/meter"

/** Phase 1 live connectivity row status (registry + TCP listener join). */
export type ConnectivityPhase1LiveStatus =
  | "live_inbound"
  | "online_recent_registry"
  | "offline"
  | "never_seen_registry"
  | "unknown_live"

export type ConnectivityPhase1LastSeenSource = "inbound_session" | "registry" | "none"

export type ConnectivityPhase1BindState = "none" | "pending_identity" | "bound"

/** Phase 2: derived from persisted connectivity events (same serial key as registry). */
export type ConnectivityPhase2RowHint = {
  lastEventType: string
  lastEventSummary: string
  lastEventAtDisplay: string
  recentFailureCount: number
  unstable: boolean
}

export type ConnectivityPhase1Row = {
  meterId: string
  serialNumber: string
  internalId: string
  model: string
  manufacturer: string
  feeder: string
  zone: string
  meterProfileId: string
  liveStatus: ConnectivityPhase1LiveStatus
  statusReason: string
  lastSeenDisplay: string
  lastSeenSource: ConnectivityPhase1LastSeenSource
  lastSeenIso: string | null
  registryLastCommunicationRaw: string
  registryCommStatus: MeterCommStatus
  currentRoute: string
  remoteEndpoint: string | null
  hasLiveSession: boolean
  bindState: ConnectivityPhase1BindState
  listenerBindEndpoint: string | null
  listenerEnabled: boolean
  listenerListening: boolean
  /** Phase 2 history hint when serial matches stored events. */
  phase2?: ConnectivityPhase2RowHint
}

export type ConnectivityPhase1Summary = {
  totalMeters: number
  /** live_inbound + online_recent_registry (listener snapshot successfully fetched). */
  onlineMeters: number
  liveInboundMeters: number
  onlineRecentRegistryMeters: number
  offlineMeters: number
  unknownLiveMeters: number
  neverSeenMeters: number
  stagedSessionCount: number
  listenerEnabled: boolean
  listenerListening: boolean
  listenerFetchFailed: boolean
  registryRecentWindowMs: number
}

export type ConnectivityPhase1Response = {
  summary: ConnectivityPhase1Summary
  rows: ConnectivityPhase1Row[]
  fetchedAt: string
  /** Newest first; `dedupeKey` stripped. */
  recentEvents: Omit<ConnectivityEventRecord, "dedupeKey">[]
}

export type ConnectivityHealthState =
  | "healthy"
  | "degraded"
  | "failed"
  | "unknown"

/** Operational connectivity monitoring row (read-only API + UI filters). */
export type ConnectivityListRow = {
  id: string
  serialNumber: string
  commState: MeterCommStatus
  healthState: ConnectivityHealthState
  signalQuality: string
  lastCommunicationAt: string
  lastSuccessfulReadAt: string
  networkType: string
  routeId: string
  gatewayId: string
  endpoint: string
  firmwareVersion: string
  protocolVersion: string
}
