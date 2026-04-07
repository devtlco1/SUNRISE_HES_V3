import type { ObisCatalogEntry } from "@/lib/obis/types"

export type CatalogImportMergeResult = {
  merged: ObisCatalogEntry[]
  addedCount: number
  skippedCount: number
  addedObis: string[]
  skippedObis: string[]
}

/**
 * Append imported rows that are not already present (dedupe by OBIS string, trim).
 * Existing row order and fields are preserved; new rows get per-pack sort_order after current max in that pack.
 * Idempotent: repeated merge with the same import does not add duplicates.
 */
export function mergeCatalogImportExistingWins(
  existing: ObisCatalogEntry[],
  imported: ObisCatalogEntry[],
): CatalogImportMergeResult {
  const existingKeys = new Set(existing.map((r) => r.obis.trim()))
  const maxSortByPack = new Map<string, number>()
  for (const r of existing) {
    const pk = r.pack_key
    maxSortByPack.set(pk, Math.max(maxSortByPack.get(pk) ?? 0, r.sort_order))
  }

  const merged = [...existing]
  const addedObis: string[] = []
  const skippedObis: string[] = []

  for (const row of imported) {
    const key = row.obis.trim()
    if (!key || existingKeys.has(key)) {
      if (key) skippedObis.push(key)
      continue
    }
    const pk = row.pack_key
    const next = (maxSortByPack.get(pk) ?? 0) + 1
    maxSortByPack.set(pk, next)
    merged.push({ ...row, obis: key, sort_order: next })
    existingKeys.add(key)
    addedObis.push(key)
  }

  return {
    merged,
    addedCount: addedObis.length,
    skippedCount: skippedObis.length,
    addedObis,
    skippedObis,
  }
}
