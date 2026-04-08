/**
 * Browser-side access to the persisted OBIS catalog (single source of truth for read surfaces).
 */

import type { ObisCatalogEntry } from "@/lib/obis/types"

export const OBIS_CATALOG_API_PATH = "/api/obis-catalog"

export type FetchObisCatalogResult =
  | { ok: true; rows: ObisCatalogEntry[] }
  | { ok: false; error: string }

export async function fetchObisCatalog(
  signal?: AbortSignal
): Promise<FetchObisCatalogResult> {
  try {
    const res = await fetch(OBIS_CATALOG_API_PATH, {
      cache: "no-store",
      signal,
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    })
    const data = await res.json()
    if (!res.ok || !Array.isArray(data)) {
      return { ok: false, error: "OBIS catalog unavailable" }
    }
    return { ok: true, rows: data as ObisCatalogEntry[] }
  } catch {
    return { ok: false, error: "OBIS catalog load failed" }
  }
}
