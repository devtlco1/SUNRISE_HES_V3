import type { ConnectivityPhase1Response } from "@/types/connectivity"

export type FetchConnectivityPhase1Result =
  | { ok: true; data: ConnectivityPhase1Response }
  | { ok: false; error: string }

const LOAD_FAILED =
  "Connectivity data could not be loaded. Retry shortly or contact operations if this continues."
const INVALID_PAYLOAD =
  "The connectivity response was invalid. Verify deployment and API version."
export const CONNECTIVITY_FETCH_NETWORK_ERROR =
  "Network error while loading connectivity."

function isPhase1Response(v: unknown): v is ConnectivityPhase1Response {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  if (!o.summary || typeof o.summary !== "object") return false
  if (!Array.isArray(o.rows)) return false
  if (!Array.isArray(o.recentEvents)) return false
  if (typeof o.fetchedAt !== "string") return false
  const s = o.summary as Record<string, unknown>
  return typeof s.totalMeters === "number"
}

/**
 * Phase 1: meter registry + Python TCP listener snapshot (via server aggregation).
 */
export async function fetchConnectivityPhase1(
  signal?: AbortSignal
): Promise<FetchConnectivityPhase1Result> {
  try {
    const res = await fetch("/api/connectivity", {
      signal,
      cache: "no-store",
    })

    if (!res.ok) {
      let code: string | undefined
      try {
        const body = (await res.json()) as { error?: string }
        code = body.error
      } catch {
        /* ignore */
      }
      if (code === "METERS_LOAD_FAILED" || code === "INVALID_METERS_ROWS") {
        return { ok: false, error: LOAD_FAILED }
      }
      return { ok: false, error: LOAD_FAILED }
    }

    const data: unknown = await res.json()
    if (!isPhase1Response(data)) {
      return { ok: false, error: INVALID_PAYLOAD }
    }
    return { ok: true, data }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e
    }
    return { ok: false, error: CONNECTIVITY_FETCH_NETWORK_ERROR }
  }
}
