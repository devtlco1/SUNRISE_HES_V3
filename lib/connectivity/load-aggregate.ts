import { buildConnectivityPhase1Response } from "@/lib/connectivity/phase1-aggregate"
import { buildPhase2HintsBySerial } from "@/lib/connectivity-events/phase2-hints"
import { syncConnectivityEventsFromListenerStatus } from "@/lib/connectivity-events/listener-snapshot"
import { readConnectivityEventsRaw, toPublicConnectivityEvent } from "@/lib/connectivity-events/store"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import {
  getTcpListenerStatusFromSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import type { ConnectivityPhase1Response, ConnectivityPhase1Row } from "@/types/connectivity"
import type { ConnectivityEventRecord } from "@/types/connectivity-events"
import type { MeterListRow } from "@/types/meter"

const HINTS_EVENT_SCAN = 2500

export function eventsNewestFirst(events: ConnectivityEventRecord[]): ConnectivityEventRecord[] {
  return [...events].sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1
    if (a.createdAt > b.createdAt) return -1
    return 0
  })
}

export type ConnectivityAggregationOk = {
  ok: true
  meters: MeterListRow[]
  listenerStatus: Record<string, unknown> | null
  listenerFetchFailed: boolean
  rows: ConnectivityPhase1Row[]
  summary: ConnectivityPhase1Response["summary"]
}

export type ConnectivityAggregationResult =
  | ConnectivityAggregationOk
  | { ok: false; error: "METERS_LOAD_FAILED" | "INVALID_METERS_ROWS" }

/**
 * Shared loader: meters + sidecar listener + listener→event sync + phase1 rows + hint inputs.
 */
export async function loadConnectivityAggregation(): Promise<ConnectivityAggregationResult> {
  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return { ok: false, error: "METERS_LOAD_FAILED" }
  }
  const meters = normalizeMeterRows(raw.parsed)
  if (meters.length === 0 && raw.parsed.length > 0) {
    return { ok: false, error: "INVALID_METERS_ROWS" }
  }

  let listenerStatus: Record<string, unknown> | null = null
  let listenerFetchFailed = false

  try {
    listenerStatus = (await getTcpListenerStatusFromSidecar()) as Record<string, unknown>
  } catch (e) {
    listenerFetchFailed = true
    if (
      e instanceof PythonSidecarNotConfiguredError ||
      e instanceof PythonSidecarHttpError
    ) {
      /* unknown_live in aggregate */
    }
  }

  if (listenerStatus && !listenerFetchFailed) {
    try {
      await syncConnectivityEventsFromListenerStatus(listenerStatus)
    } catch {
      /* non-fatal */
    }
  }

  const evRaw = await readConnectivityEventsRaw()
  const allEvents = evRaw.ok ? evRaw.events : []
  const newest = eventsNewestFirst(allEvents)
  const forHints = newest.slice(0, HINTS_EVENT_SCAN)
  const hintsBySerial = buildPhase2HintsBySerial(forHints)

  const core = buildConnectivityPhase1Response(
    meters,
    listenerStatus,
    listenerFetchFailed,
    hintsBySerial
  )

  return {
    ok: true,
    meters,
    listenerStatus,
    listenerFetchFailed,
    rows: core.rows,
    summary: core.summary,
  }
}

export function buildRecentPublicEvents(
  eventsNewestFirstOrder: ConnectivityEventRecord[],
  cap: number
): Omit<ConnectivityEventRecord, "dedupeKey">[] {
  return eventsNewestFirstOrder.slice(0, cap).map((e) => toPublicConnectivityEvent(e))
}
