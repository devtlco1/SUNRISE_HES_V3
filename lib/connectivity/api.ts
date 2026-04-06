import { normalizeConnectivityRows } from "@/lib/connectivity/normalize"
import type { ConnectivityListRow } from "@/types/connectivity"

export type FetchConnectivityResult =
  | { ok: true; rows: ConnectivityListRow[] }
  | { ok: false; error: string }

const LOAD_FAILED =
  "The connectivity catalog could not be loaded. Retry shortly or contact operations if this continues."
const INVALID_PAYLOAD =
  "The connectivity response was invalid. Verify the catalog source and deployment."
export const CONNECTIVITY_FETCH_NETWORK_ERROR =
  "Network error while loading the connectivity catalog."

function messageForErrorCode(code: string | undefined): string {
  if (
    code === "INVALID_CONNECTIVITY_PAYLOAD" ||
    code === "INVALID_CONNECTIVITY_ROWS"
  ) {
    return INVALID_PAYLOAD
  }
  return LOAD_FAILED
}

/**
 * Client-side fetch of read-only connectivity rows from the local App Router API.
 * Search and filters stay in the UI; this returns the full row set.
 */
export async function fetchConnectivity(
  signal?: AbortSignal
): Promise<FetchConnectivityResult> {
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
      return { ok: false, error: messageForErrorCode(code) }
    }

    const data: unknown = await res.json()
    const rows = normalizeConnectivityRows(data)
    if (rows.length === 0 && Array.isArray(data) && data.length > 0) {
      return { ok: false, error: INVALID_PAYLOAD }
    }
    return { ok: true, rows }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e
    }
    return { ok: false, error: CONNECTIVITY_FETCH_NETWORK_ERROR }
  }
}
