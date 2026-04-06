import type { DashboardSnapshot } from "@/types/dashboard"

export type FetchDashboardResult =
  | { ok: true; snapshot: DashboardSnapshot }
  | { ok: false; error: string }

const LOAD_FAILED =
  "The dashboard summary could not be loaded. Retry shortly or contact operations if this continues."
export const DASHBOARD_FETCH_NETWORK_ERROR =
  "Network error while loading the dashboard summary."

function messageForErrorCode(code: string | undefined): string {
  if (code === "DASHBOARD_LOAD_FAILED") return LOAD_FAILED
  return LOAD_FAILED
}

export async function fetchDashboard(
  signal?: AbortSignal
): Promise<FetchDashboardResult> {
  try {
    const res = await fetch("/api/dashboard", {
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

    const snapshot = (await res.json()) as DashboardSnapshot
    return { ok: true, snapshot }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e
    }
    return { ok: false, error: DASHBOARD_FETCH_NETWORK_ERROR }
  }
}
