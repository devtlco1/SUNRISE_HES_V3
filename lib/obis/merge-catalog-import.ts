import { subclassKey } from "@/lib/obis/catalog-vendor-group"
import type { ObisCatalogEntry } from "@/lib/obis/types"

export type CatalogImportMergeResult = {
  merged: ObisCatalogEntry[]
  addedCount: number
  skippedCount: number
  addedObis: string[]
  skippedObis: string[]
}

function classSubclassKey(r: ObisCatalogEntry): string {
  return `${r.class_name}\0${subclassKey(r)}`
}

/**
 * Append imported rows not already present (dedupe by object_code).
 * New rows get sort_no / sort_order after current max within same class + subclass.
 */
export function mergeCatalogImportExistingWins(
  existing: ObisCatalogEntry[],
  imported: ObisCatalogEntry[]
): CatalogImportMergeResult {
  const existingKeys = new Set(existing.map((r) => r.object_code.trim()))
  const maxSortByGroup = new Map<string, number>()
  for (const r of existing) {
    const g = classSubclassKey(r)
    maxSortByGroup.set(g, Math.max(maxSortByGroup.get(g) ?? 0, r.sort_no))
  }

  const merged = [...existing]
  const addedObis: string[] = []
  const skippedObis: string[] = []

  for (const row of imported) {
    const key = row.object_code.trim()
    if (!key || existingKeys.has(key)) {
      if (key) skippedObis.push(key)
      continue
    }
    const g = classSubclassKey(row)
    const next = (maxSortByGroup.get(g) ?? 0) + 1
    maxSortByGroup.set(g, next)
    const sort_no = row.sort_no > 0 ? row.sort_no : next
    merged.push({ ...row, object_code: key, sort_no, sort_order: sort_no })
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
