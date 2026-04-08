import { readConnectivityEventsRaw, writeConnectivityEventsArray } from "./store"

import type { ConnectivityEventRecord } from "@/types/connectivity-events"

const DEDUPE_TAIL = 400
const DEDUPE_WINDOW_MS = 90_000

function newestFirst(a: ConnectivityEventRecord, b: ConnectivityEventRecord): number {
  if (a.createdAt < b.createdAt) return 1
  if (a.createdAt > b.createdAt) return -1
  return 0
}

function isDuplicateAgainst(
  recentSorted: ConnectivityEventRecord[],
  event: ConnectivityEventRecord
): boolean {
  if (!event.dedupeKey) return false
  const now = Date.parse(event.createdAt)
  if (!Number.isFinite(now)) return false
  for (let i = 0; i < Math.min(DEDUPE_TAIL, recentSorted.length); i++) {
    const prev = recentSorted[i]!
    if (prev.dedupeKey !== event.dedupeKey) continue
    const t = Date.parse(prev.createdAt)
    if (Number.isFinite(t) && now - t < DEDUPE_WINDOW_MS) {
      return true
    }
  }
  return false
}

/**
 * Append one event if no matching `dedupeKey` exists in the last DEDUPE_TAIL events
 * within DEDUPE_WINDOW_MS (prevents spam from UI retries / tight poll loops).
 */
export async function appendConnectivityEvent(
  event: ConnectivityEventRecord
): Promise<void> {
  const raw = await readConnectivityEventsRaw()
  if (!raw.ok) return

  const sorted = [...raw.events].sort(newestFirst)
  if (isDuplicateAgainst(sorted, event)) return

  await writeConnectivityEventsArray([...raw.events, event])
}

/** Append many in one read/write; dedupe each against prior file + earlier batch items. */
export async function appendConnectivityEventsBatch(
  batch: ConnectivityEventRecord[]
): Promise<void> {
  if (batch.length === 0) return
  const raw = await readConnectivityEventsRaw()
  if (!raw.ok) return

  const sorted = [...raw.events].sort(newestFirst)
  const acc = [...raw.events]
  for (const event of batch) {
    if (isDuplicateAgainst(sorted, event)) continue
    acc.push(event)
    sorted.unshift(event)
    sorted.sort(newestFirst)
  }
  await writeConnectivityEventsArray(acc)
}
