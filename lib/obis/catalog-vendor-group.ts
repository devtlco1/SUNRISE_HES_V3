import type { ObisCatalogEntry } from "@/lib/obis/types"

/** Distinct ClassName values, sorted. */
export function classNamesPresent(rows: ObisCatalogEntry[]): string[] {
  const s = new Set(rows.map((r) => r.class_name))
  return [...s].sort((a, b) => a.localeCompare(b))
}

const NONE = "__none__"

export function subclassKey(row: ObisCatalogEntry): string {
  const t = row.subclass_name.trim()
  return t ? t : NONE
}

export function subclassLabelFromKey(key: string): string {
  return key === NONE ? "(no subclass)" : key
}

/** Subclass keys under a class (SortNo order preserved via first-seen walk). */
export function subclassKeysForClass(
  rows: ObisCatalogEntry[],
  className: string
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const filtered = rows
    .filter((r) => r.class_name === className)
    .sort((a, b) => {
      if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no
      return a.object_code.localeCompare(b.object_code)
    })
  for (const r of filtered) {
    const k = subclassKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    ordered.push(k)
  }
  return ordered
}

export function getCatalogRowsForClassAndSubclassFromRows(
  rows: ObisCatalogEntry[],
  className: string,
  subclassKeySel: string
): ObisCatalogEntry[] {
  return rows
    .filter((r) => {
      if (r.class_name !== className) return false
      return subclassKey(r) === subclassKeySel
    })
    .sort((a, b) => {
      if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no
      return a.object_code.localeCompare(b.object_code)
    })
}

export { NONE as VENDOR_SUBCLASS_NONE_KEY }

/** ClassName + subclass key for runtime `packKey` (vendor semantics, not legacy app tabs). */
export function catalogPackKey(r: ObisCatalogEntry): string {
  return `${r.class_name}|${subclassKey(r)}`
}
