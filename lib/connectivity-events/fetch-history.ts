import type { ConnectivityEventRecord } from "@/types/connectivity-events"

export type FetchConnectivityEventsResult =
  | { ok: true; events: Omit<ConnectivityEventRecord, "dedupeKey">[] }
  | { ok: false; error: string }

export async function fetchConnectivityEventsHistory(
  opts: {
    limit?: number
    failuresOnly?: boolean
    serial?: string
    signal?: AbortSignal
  } = {}
): Promise<FetchConnectivityEventsResult> {
  const q = new URLSearchParams()
  q.set("limit", String(opts.limit ?? 50))
  if (opts.failuresOnly) q.set("failuresOnly", "1")
  const s = opts.serial?.trim()
  if (s) q.set("serial", s.toLowerCase())
  try {
    const res = await fetch(`/api/connectivity-events?${q.toString()}`, {
      cache: "no-store",
      signal: opts.signal,
    })
    if (!res.ok) {
      return { ok: false, error: "Could not load connectivity events." }
    }
    const data = (await res.json()) as { events?: unknown }
    if (!Array.isArray(data.events)) {
      return { ok: false, error: "Invalid events response." }
    }
    return { ok: true, events: data.events as Omit<ConnectivityEventRecord, "dedupeKey">[] }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: "Network error loading events." }
  }
}
