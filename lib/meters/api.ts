import { normalizeMeterRows } from "@/lib/meters/normalize"
import type { MeterListRow } from "@/types/meter"

export type FetchMetersResult =
  | { ok: true; rows: MeterListRow[] }
  | { ok: false; error: string }

const LOAD_FAILED =
  "The meter registry could not be loaded. Retry shortly or contact operations if this continues."
const INVALID_PAYLOAD =
  "The registry response was invalid. Verify the catalog source and deployment."
export const METERS_FETCH_NETWORK_ERROR =
  "Network error while loading the meter registry."

function messageForErrorCode(code: string | undefined): string {
  if (code === "INVALID_METERS_PAYLOAD" || code === "INVALID_METERS_ROWS") {
    return INVALID_PAYLOAD
  }
  return LOAD_FAILED
}

/**
 * Client-side fetch of read-only meters from the local App Router API.
 * Search and filters stay in the UI; this returns the full row set.
 */
export async function fetchMeters(signal?: AbortSignal): Promise<FetchMetersResult> {
  try {
    const res = await fetch("/api/meters", {
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
      return { ok: false, error: messageForErrorCode(code) }
    }

    const data: unknown = await res.json()
    const rows = normalizeMeterRows(data)
    if (rows.length === 0 && Array.isArray(data) && data.length > 0) {
      return { ok: false, error: INVALID_PAYLOAD }
    }
    return { ok: true, rows }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e
    }
    return { ok: false, error: METERS_FETCH_NETWORK_ERROR }
  }
}
