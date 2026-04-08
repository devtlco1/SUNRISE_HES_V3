import { formatOperatorUtc } from "@/lib/format/operator-datetime"
import type { ConnectivityPhase2RowHint } from "@/types/connectivity"
import type { ConnectivityEventRecord } from "@/types/connectivity-events"
import { CONNECTIVITY_FAILURE_EVENT_TYPES } from "@/types/connectivity-events"

const FAILURE_WINDOW_MS = 45 * 60 * 1000
const UNSTABLE_MIN_FAILURES = 3

function serialKey(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Build per-serial hints from recent events (newest-first input preferred).
 */
export function buildPhase2HintsBySerial(
  eventsNewestFirst: ConnectivityEventRecord[],
  nowMs: number = Date.now()
): Map<string, ConnectivityPhase2RowHint> {
  const bySerial = new Map<string, ConnectivityEventRecord[]>()
  for (const e of eventsNewestFirst) {
    const s = e.meterSerial?.trim()
    if (!s) continue
    const k = serialKey(s)
    const arr = bySerial.get(k)
    if (arr) arr.push(e)
    else bySerial.set(k, [e])
  }

  const out = new Map<string, ConnectivityPhase2RowHint>()
  for (const [k, list] of bySerial) {
    const newest = list[0]
    if (!newest) continue
    let recentFailureCount = 0
    for (const e of list) {
      const t = Date.parse(e.createdAt)
      if (!Number.isFinite(t) || nowMs - t > FAILURE_WINDOW_MS) continue
      if (CONNECTIVITY_FAILURE_EVENT_TYPES.has(e.eventType)) {
        recentFailureCount += 1
      }
    }
    out.set(k, {
      lastEventType: newest.eventType,
      lastEventSummary: newest.message.slice(0, 120),
      lastEventAtDisplay: formatOperatorUtc(newest.createdAt),
      recentFailureCount,
      unstable: recentFailureCount >= UNSTABLE_MIN_FAILURES,
    })
  }
  return out
}
