/**
 * Phase 1 live connectivity: joins meter registry + Python TCP listener status.
 *
 * Classification (honest, rule-based):
 * - live_inbound: Serial matches a staged inbound TCP session (bound canonical, or pending bind already
 *   tied to this serial in the runtime snapshot).
 * - online_recent_registry: No matching inbound session, but registry `lastCommunicationAt` parses and
 *   is within PHASE1_REGISTRY_RECENT_MS (default 15 minutes, UTC). Only evaluated when listener status
 *   was fetched successfully — avoids implying live TCP when we cannot rule out sessions.
 * - offline: Listener OK, no inbound session, registry last-seen exists and is outside the recent window.
 * - unknown_live: Listener status unavailable — cannot classify live vs offline honestly.
 * - never_seen_registry: Registry last communication missing, unparseable, or before 1990-01-01 UTC.
 *
 * Registry `commStatus` / `lastCommunicationAt` are shown separately; they are catalog fields and are
 * not used to infer "online" for the live strip (avoids fake green from stale JSON).
 */

import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import { PHASE1_REGISTRY_RECENT_MS } from "@/lib/connectivity/phase1-constants"
import type {
  ConnectivityPhase1LiveStatus,
  ConnectivityPhase1Response,
  ConnectivityPhase1Row,
  ConnectivityPhase1Summary,
  ConnectivityPhase2RowHint,
} from "@/types/connectivity"
import type { MeterListRow } from "@/types/meter"

/** Inbound sessions: same shape as scanner `parseStagedSessions` (Python `staged_modem_listener`). */
export type ParsedStagedSession = {
  pendingBind: boolean
  canonicalSerial?: string
  remoteHost: string
  remotePort: number
  acceptedAtUtc: string
  sessionState?: string
}

export function parseTcpListenerStagedSessions(
  status: Record<string, unknown> | null
): ParsedStagedSession[] {
  if (!status) return []
  const raw = status.stagedSessions
  if (!Array.isArray(raw)) return []
  const out: ParsedStagedSession[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const rh = o.remoteHost
    const rp = o.remotePort
    const at = o.acceptedAtUtc
    if (typeof rh !== "string" || typeof at !== "string") continue
    if (typeof rp !== "number") continue
    const pending = o.pendingBind === true
    const cs = typeof o.canonicalSerial === "string" ? o.canonicalSerial : undefined
    const sessionState = typeof o.sessionState === "string" ? o.sessionState : undefined
    out.push({
      pendingBind: pending,
      canonicalSerial: cs,
      remoteHost: rh,
      remotePort: rp,
      acceptedAtUtc: at,
      sessionState,
    })
  }
  return out
}

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1
}

/** Parse registry timestamps: ISO or "YYYY-MM-DD HH:mm" (treated as UTC). */
export function parseRegistryLastCommunication(raw: string): Date | null {
  const t = raw.trim()
  if (!t) return null
  const d0 = new Date(t)
  if (!Number.isNaN(d0.getTime())) return d0
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (m) {
    const d = new Date(
      Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function isNeverSeenRegistry(lastCommunicationAt: string): boolean {
  const d = parseRegistryLastCommunication(lastCommunicationAt)
  if (!d) return true
  return d.getTime() < Date.UTC(1990, 0, 1)
}

function sessionMatchesSerial(s: ParsedStagedSession, serial: string): boolean {
  const sn = serial.trim()
  if (!sn) return false
  if (s.pendingBind) {
    return false
  }
  const cs = (s.canonicalSerial ?? "").trim()
  return cs !== "" && cs === sn
}

function sessionPendingForDisplay(s: ParsedStagedSession, serial: string): boolean {
  const sn = serial.trim()
  if (!sn || !s.pendingBind) return false
  return (s.canonicalSerial ?? "").trim() === sn
}

function pickSessionForMeter(
  serial: string,
  sessions: ParsedStagedSession[]
): ParsedStagedSession | null {
  const sn = serial.trim()
  if (!sn) return null
  const bound = sessions.find((s) => sessionMatchesSerial(s, sn))
  if (bound) return bound
  const pending = sessions.find((s) => sessionPendingForDisplay(s, sn))
  return pending ?? null
}

export function buildConnectivityPhase1Response(
  meters: MeterListRow[],
  listenerStatus: Record<string, unknown> | null,
  listenerFetchFailed: boolean,
  phase2Hints?: Map<string, ConnectivityPhase2RowHint>
): Omit<ConnectivityPhase1Response, "recentEvents"> {
  const sessions = parseTcpListenerStagedSessions(listenerStatus)
  const listenerEnabled = listenerStatus ? boolish(listenerStatus.listenerEnabled) : false
  const listenerListening = listenerStatus ? boolish(listenerStatus.listening) : false
  const bindHost =
    listenerStatus && typeof listenerStatus.bindHost === "string"
      ? listenerStatus.bindHost
      : ""
  const bindPort =
    listenerStatus && typeof listenerStatus.bindPort === "number"
      ? listenerStatus.bindPort
      : null

  const rows: ConnectivityPhase1Row[] = []

  let liveInbound = 0
  let onlineRecentRegistry = 0
  let offline = 0
  let unknownLive = 0
  let neverSeen = 0

  const now = Date.now()

  for (const m of meters) {
    const serial = m.serialNumber.trim()
    let liveStatus: ConnectivityPhase1LiveStatus
    let statusReason: string
    let hasLiveSession = false
    let bindState: ConnectivityPhase1Row["bindState"] = "none"
    let remoteEndpoint: string | null = null
    let lastSeenIso: string | null = null
    let lastSeenDisplay: string
    let lastSeenSource: ConnectivityPhase1Row["lastSeenSource"] = "registry"
    let currentRoute: string

    const regDate = parseRegistryLastCommunication(m.lastCommunicationAt)
    const regNever = isNeverSeenRegistry(m.lastCommunicationAt)

    if (listenerFetchFailed) {
      liveStatus = "unknown_live"
      statusReason = "Runtime TCP listener status unavailable (check Python sidecar)."
      unknownLive += 1
      currentRoute = "unknown"
      lastSeenDisplay = regDate
        ? formatOperatorDateTime(m.lastCommunicationAt)
        : "—"
      if (regNever) {
        neverSeen += 1
      }
    } else {
      const sess = pickSessionForMeter(serial, sessions)
      if (sess) {
        hasLiveSession = true
        liveInbound += 1
        liveStatus = "live_inbound"
        remoteEndpoint = `${sess.remoteHost}:${sess.remotePort}`
        lastSeenIso = sess.acceptedAtUtc
        lastSeenDisplay = formatOperatorDateTime(sess.acceptedAtUtc)
        lastSeenSource = "inbound_session"
        currentRoute = "inbound_tcp"
        if (sess.pendingBind) {
          bindState = "pending_identity"
          statusReason =
            "Inbound TCP session active; identity/bind pending or awaiting canonical serial."
        } else {
          bindState = "bound"
          statusReason = "Inbound TCP session bound to this meter (canonical serial)."
        }
      } else {
        hasLiveSession = false
        bindState = "none"
        currentRoute = listenerListening ? "none (listener up)" : "none (listener idle)"

        if (regNever) {
          liveStatus = "never_seen_registry"
          neverSeen += 1
          statusReason =
            "No active inbound session; registry has no parseable last communication time."
          lastSeenDisplay = "—"
          lastSeenSource = "none"
        } else {
          lastSeenDisplay = formatOperatorDateTime(m.lastCommunicationAt)
          lastSeenSource = "registry"
          const regMs = regDate!.getTime()
          const recent =
            Number.isFinite(regMs) && now - regMs <= PHASE1_REGISTRY_RECENT_MS
          if (recent) {
            liveStatus = "online_recent_registry"
            onlineRecentRegistry += 1
            statusReason = `No inbound session in snapshot; registry last communication within ${PHASE1_REGISTRY_RECENT_MS / 60000} minutes (UTC).`
          } else {
            liveStatus = "offline"
            offline += 1
            statusReason =
              "No active inbound session and registry last communication outside the recent window."
          }
        }
      }
    }

    const sk = serial.trim().toLowerCase()
    rows.push({
      meterId: m.id,
      serialNumber: m.serialNumber,
      internalId: m.id,
      model: m.model,
      manufacturer: m.manufacturer,
      feeder: m.feeder,
      zone: m.zone,
      meterProfileId: m.meterProfileId,
      liveStatus,
      statusReason,
      lastSeenDisplay,
      lastSeenSource,
      lastSeenIso,
      registryLastCommunicationRaw: m.lastCommunicationAt,
      registryCommStatus: m.commStatus,
      currentRoute,
      remoteEndpoint,
      hasLiveSession,
      bindState,
      listenerBindEndpoint:
        bindHost && bindPort != null ? `${bindHost}:${bindPort}` : null,
      listenerEnabled,
      listenerListening,
      phase2: phase2Hints?.get(sk),
    })
  }

  const summary: ConnectivityPhase1Summary = {
    totalMeters: meters.length,
    onlineMeters: liveInbound + onlineRecentRegistry,
    liveInboundMeters: liveInbound,
    onlineRecentRegistryMeters: onlineRecentRegistry,
    offlineMeters: offline,
    unknownLiveMeters: unknownLive,
    neverSeenMeters: neverSeen,
    stagedSessionCount: sessions.length,
    listenerEnabled,
    listenerListening,
    listenerFetchFailed,
    registryRecentWindowMs: PHASE1_REGISTRY_RECENT_MS,
  }

  return {
    summary,
    rows,
    fetchedAt: new Date().toISOString(),
  }
}
