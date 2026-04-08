import {
  buildRecentPublicEvents,
  eventsNewestFirst,
  loadConnectivityAggregation,
} from "@/lib/connectivity/load-aggregate"
import { readConnectivityEventsRaw } from "@/lib/connectivity-events/store"
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import type {
  ConnectivityMeterDerived,
  ConnectivityMeterDetailPayload,
} from "@/types/connectivity"
import type { ConnectivityEventRecord, ConnectivityEventType } from "@/types/connectivity-events"
import { CONNECTIVITY_FAILURE_EVENT_TYPES } from "@/types/connectivity-events"
import type { MeterListRow } from "@/types/meter"

const WINDOW_MS = 45 * 60 * 1000
const UNSTABLE_MIN = 3
const HISTORY_CAP = 200

const SUCCESS_TYPES: ReadonlySet<ConnectivityEventType> = new Set([
  "connected",
  "restored",
  "auto_bind_success",
  "association_success",
])

function firstOfType(
  newestFirst: ConnectivityEventRecord[],
  t: ConnectivityEventType
): ConnectivityEventRecord | undefined {
  return newestFirst.find((e) => e.eventType === t)
}

function isoDisplay(iso: string | null): string {
  if (!iso) return "—"
  return formatOperatorDateTime(iso)
}

function deriveFromEvents(
  newestFirst: ConnectivityEventRecord[],
  nowMs: number
): ConnectivityMeterDerived {
  const c = firstOfType(newestFirst, "connected")
  const d = firstOfType(newestFirst, "disconnected")
  const r = firstOfType(newestFirst, "restored")
  const af = firstOfType(newestFirst, "association_failed")
  const to = firstOfType(newestFirst, "timeout")

  let recentFailures45m = 0
  let recentSuccesses45m = 0
  for (const e of newestFirst) {
    const t = Date.parse(e.createdAt)
    if (!Number.isFinite(t) || nowMs - t > WINDOW_MS) continue
    if (CONNECTIVITY_FAILURE_EVENT_TYPES.has(e.eventType)) {
      recentFailures45m += 1
    }
    if (SUCCESS_TYPES.has(e.eventType)) {
      recentSuccesses45m += 1
    }
  }

  return {
    lastConnectAt: c?.createdAt ?? null,
    lastConnectDisplay: isoDisplay(c?.createdAt ?? null),
    lastDisconnectAt: d?.createdAt ?? null,
    lastDisconnectDisplay: isoDisplay(d?.createdAt ?? null),
    lastRestoreAt: r?.createdAt ?? null,
    lastRestoreDisplay: isoDisplay(r?.createdAt ?? null),
    lastAssociationFailureAt: af?.createdAt ?? null,
    lastAssociationFailureDisplay: isoDisplay(af?.createdAt ?? null),
    lastTimeoutAt: to?.createdAt ?? null,
    lastTimeoutDisplay: isoDisplay(to?.createdAt ?? null),
    recentFailures45m,
    recentSuccesses45m,
    unstable: recentFailures45m >= UNSTABLE_MIN,
  }
}

function eventsForMeter(
  allNewestFirst: ConnectivityEventRecord[],
  meter: MeterListRow
): ConnectivityEventRecord[] {
  const id = meter.id.trim()
  const serial = meter.serialNumber.trim().toLowerCase()
  return allNewestFirst.filter((e) => {
    const ms = e.meterSerial.trim().toLowerCase()
    const mid = e.meterId.trim()
    return (
      (serial && ms === serial) ||
      (id && mid === id) ||
      (serial && mid.toLowerCase() === serial)
    )
  })
}

export async function getConnectivityMeterDetailPayload(
  meterIdOrSerial: string
): Promise<ConnectivityMeterDetailPayload | null> {
  const slug = meterIdOrSerial.trim()
  if (!slug) return null

  const agg = await loadConnectivityAggregation()
  if (!agg.ok) return null

  const meter =
    agg.meters.find((m) => m.id === slug) ??
    agg.meters.find(
      (m) => m.serialNumber.trim().toLowerCase() === slug.toLowerCase()
    )
  if (!meter) return null

  const id = meter.id
  const live = agg.rows.find((r) => r.meterId === id)
  if (!live) return null

  const evRaw = await readConnectivityEventsRaw()
  const all = evRaw.ok ? eventsNewestFirst(evRaw.events) : []
  const mine = eventsForMeter(all, meter)
  const history = buildRecentPublicEvents(mine, HISTORY_CAP)
  const derived = deriveFromEvents(mine, Date.now())

  return { meter, live, history, derived }
}
