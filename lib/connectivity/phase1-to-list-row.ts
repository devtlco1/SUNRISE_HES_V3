import type {
  ConnectivityHealthState,
  ConnectivityListRow,
  ConnectivityPhase1LiveStatus,
  ConnectivityPhase1Row,
} from "@/types/connectivity"

function healthFromLiveStatus(s: ConnectivityPhase1LiveStatus): ConnectivityHealthState {
  switch (s) {
    case "live_inbound":
    case "online_recent_registry":
      return "healthy"
    case "offline":
      return "failed"
    case "unknown_live":
      return "degraded"
    case "never_seen_registry":
    default:
      return "unknown"
  }
}

/** Maps Phase 1 API rows to the connectivity list table shape. */
export function mapPhase1RowToConnectivityListRow(
  r: ConnectivityPhase1Row
): ConnectivityListRow {
  const unstable = r.phase2?.unstable === true
  return {
    id: r.meterId,
    serialNumber: r.serialNumber,
    commState: r.registryCommStatus,
    healthState: healthFromLiveStatus(r.liveStatus),
    signalQuality: unstable ? "Unstable (events)" : "—",
    lastCommunicationAt: r.lastSeenDisplay,
    lastSuccessfulReadAt: r.registryLastCommunicationRaw || r.lastSeenDisplay,
    networkType: r.manufacturer || "—",
    routeId: r.currentRoute || "—",
    gatewayId: r.zone || r.feeder || "—",
    endpoint: r.remoteEndpoint ?? "—",
    firmwareVersion: r.model || "—",
    protocolVersion: "—",
  }
}

export function mapPhase1RowsToConnectivityListRows(
  rows: ConnectivityPhase1Row[]
): ConnectivityListRow[] {
  return rows.map(mapPhase1RowToConnectivityListRow)
}
