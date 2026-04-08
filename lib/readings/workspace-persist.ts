/**
 * Versioned sessionStorage snapshot for /readings operator workspace (UI + last displayed results).
 * Does not imply an active runtime session; restored data is a display snapshot only.
 */

import type { ObisRowReadState } from "@/lib/obis/merge-read-results"
import type { ObisFamilyTab } from "@/lib/obis/types"
import type {
  ReadObisSelectionPayload,
  RelayControlPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export const READINGS_WORKSPACE_STORAGE_KEY = "sunrise-readings-workspace-v1"
export const READINGS_WORKSPACE_VERSION = 1

export type ReadingsTransportMode = "inbound" | "direct"

export type PersistedActionLogEntry = {
  id: string
  ts: number
  level: "info" | "warn" | "error"
  serial: string
  tag: string
  summary: string
  detail?: string
}

export type PersistedPerMeterReadingsState = {
  relayState: "on" | "off" | "unknown"
  relayConfidence: "confirmed" | "unconfirmed" | "unknown"
  lastRelayPayload: RelayControlPayload | null
  relayError: string | null
  actionError: string | null
  lastEnv: RuntimeResponseEnvelope<ReadObisSelectionPayload> | null
  rowState: Record<string, ObisRowReadState>
}

export type PersistedReadingsWorkspace = {
  v: number
  meterId: string
  familyTab: ObisFamilyTab
  pack: string
  transport: ReadingsTransportMode
  selectedObis: string[]
  perMeter: Record<string, PersistedPerMeterReadingsState>
  diagnosticsOpen: boolean
  expandedLogIds: string[]
  actionLog: PersistedActionLogEntry[]
}

function isFamilyTab(x: unknown): x is ObisFamilyTab {
  return x === "basic" || x === "energy" || x === "profile"
}

function isTransport(x: unknown): x is ReadingsTransportMode {
  return x === "inbound" || x === "direct"
}

function stripLastEnvFromPerMeter(
  pm: PersistedReadingsWorkspace["perMeter"]
): PersistedReadingsWorkspace["perMeter"] {
  const next: PersistedReadingsWorkspace["perMeter"] = {}
  for (const [k, v] of Object.entries(pm)) {
    next[k] = { ...v, lastEnv: null }
  }
  return next
}

function trimForStorage(
  data: Omit<PersistedReadingsWorkspace, "v">
): PersistedReadingsWorkspace {
  return {
    v: READINGS_WORKSPACE_VERSION,
    meterId: data.meterId,
    familyTab: data.familyTab,
    pack: data.pack,
    transport: data.transport,
    selectedObis: data.selectedObis.slice(0, 5000),
    perMeter: data.perMeter,
    diagnosticsOpen: data.diagnosticsOpen,
    expandedLogIds: data.expandedLogIds.slice(0, 500),
    actionLog: data.actionLog.slice(0, 100),
  }
}

export function loadReadingsWorkspace(): PersistedReadingsWorkspace | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(READINGS_WORKSPACE_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PersistedReadingsWorkspace>
    if (p.v !== READINGS_WORKSPACE_VERSION) return null
    if (typeof p.meterId !== "string") return null
    if (!isFamilyTab(p.familyTab)) return null
    if (typeof p.pack !== "string" || p.pack.length > 200) return null
    if (!isTransport(p.transport)) return null
    if (!Array.isArray(p.selectedObis)) return null
    if (!p.perMeter || typeof p.perMeter !== "object") return null
    if (typeof p.diagnosticsOpen !== "boolean") return null
    if (!Array.isArray(p.expandedLogIds)) return null
    if (!Array.isArray(p.actionLog)) return null

    const selectedObis = p.selectedObis.filter((x): x is string => typeof x === "string")
    const expandedLogIds = p.expandedLogIds.filter((x): x is string => typeof x === "string")

    const perMeter: Record<string, PersistedPerMeterReadingsState> = {}
    for (const [serial, rawMeter] of Object.entries(p.perMeter)) {
      const k = serial.trim()
      if (!k || typeof rawMeter !== "object" || !rawMeter) continue
      const m = rawMeter as Record<string, unknown>
      const rowState =
        m.rowState && typeof m.rowState === "object" ? (m.rowState as Record<string, ObisRowReadState>) : {}
      perMeter[k] = {
        relayState:
          m.relayState === "on" || m.relayState === "off" || m.relayState === "unknown"
            ? m.relayState
            : "unknown",
        relayConfidence:
          m.relayConfidence === "confirmed" ||
          m.relayConfidence === "unconfirmed" ||
          m.relayConfidence === "unknown"
            ? m.relayConfidence
            : "unknown",
        lastRelayPayload: (m.lastRelayPayload as RelayControlPayload | null) ?? null,
        relayError: typeof m.relayError === "string" ? m.relayError : null,
        actionError: typeof m.actionError === "string" ? m.actionError : null,
        lastEnv: (m.lastEnv as RuntimeResponseEnvelope<ReadObisSelectionPayload> | null) ?? null,
        rowState,
      }
    }

    const actionLog: PersistedActionLogEntry[] = []
    for (const e of p.actionLog) {
      if (!e || typeof e !== "object") continue
      const en = e as Record<string, unknown>
      if (
        typeof en.id !== "string" ||
        typeof en.ts !== "number" ||
        (en.level !== "info" && en.level !== "warn" && en.level !== "error") ||
        typeof en.serial !== "string" ||
        typeof en.tag !== "string" ||
        typeof en.summary !== "string"
      ) {
        continue
      }
      actionLog.push({
        id: en.id,
        ts: en.ts,
        level: en.level,
        serial: en.serial,
        tag: en.tag,
        summary: en.summary,
        ...(typeof en.detail === "string" ? { detail: en.detail } : {}),
      })
    }

    return {
      v: READINGS_WORKSPACE_VERSION,
      meterId: p.meterId,
      familyTab: p.familyTab,
      pack: p.pack,
      transport: p.transport,
      selectedObis,
      perMeter,
      diagnosticsOpen: p.diagnosticsOpen,
      expandedLogIds,
      actionLog,
    }
  } catch {
    return null
  }
}

export function saveReadingsWorkspace(data: Omit<PersistedReadingsWorkspace, "v">): void {
  if (typeof window === "undefined") return
  const payload = trimForStorage(data)
  const trySet = (body: PersistedReadingsWorkspace) => {
    sessionStorage.setItem(READINGS_WORKSPACE_STORAGE_KEY, JSON.stringify(body))
  }
  try {
    trySet(payload)
  } catch {
    try {
      trySet({ ...payload, perMeter: stripLastEnvFromPerMeter(payload.perMeter) })
    } catch {
      /* quota or private mode — skip */
    }
  }
}
