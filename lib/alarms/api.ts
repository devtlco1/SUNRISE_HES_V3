import { normalizeAlarmRows } from "@/lib/alarms/normalize"
import type { AlarmListRow } from "@/types/alarm"

export type FetchAlarmsResult =
  | { ok: true; rows: AlarmListRow[] }
  | { ok: false; error: string }

const LOAD_FAILED =
  "The alarm catalog could not be loaded. Retry shortly or contact operations if this continues."
const INVALID_PAYLOAD =
  "The alarm response was invalid. Verify the catalog source and deployment."
export const ALARMS_FETCH_NETWORK_ERROR =
  "Network error while loading the alarm catalog."

function messageForErrorCode(code: string | undefined): string {
  if (code === "INVALID_ALARMS_PAYLOAD" || code === "INVALID_ALARMS_ROWS") {
    return INVALID_PAYLOAD
  }
  return LOAD_FAILED
}

/**
 * Client-side fetch of read-only alarms from the local App Router API.
 * Search and filters stay in the UI; this returns the full row set.
 */
export async function fetchAlarms(signal?: AbortSignal): Promise<FetchAlarmsResult> {
  try {
    const res = await fetch("/api/alarms", {
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
    const rows = normalizeAlarmRows(data)
    if (rows.length === 0 && Array.isArray(data) && data.length > 0) {
      return { ok: false, error: INVALID_PAYLOAD }
    }
    return { ok: true, rows }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e
    }
    return { ok: false, error: ALARMS_FETCH_NETWORK_ERROR }
  }
}
