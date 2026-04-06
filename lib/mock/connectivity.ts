import connectivitySeed from "@/data/connectivity.json"
import { normalizeConnectivityRows } from "@/lib/connectivity/normalize"
import type { ConnectivityListRow } from "@/types/connectivity"

/**
 * Dev / offline UI — same catalog as `data/connectivity.json`, normalized.
 * Set `NEXT_PUBLIC_CONNECTIVITY_USE_MOCK=true` on the Connectivity page to skip HTTP.
 */
export const mockConnectivityListRows: ConnectivityListRow[] =
  normalizeConnectivityRows(connectivitySeed)
