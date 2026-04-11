import type { ObisCatalogEntry } from "@/lib/obis/types"

/**
 * Match persisted catalog `object_code` shapes to readings-export canonical codes
 * (e.g. CSV may use `1.0.0.3.0.255` + attribute `2` ⇒ `1.0.0.3.0.255.2` while catalog stores `1.0.0.3.0.255` with `attribute: 2`).
 */
export function catalogEntrySupportedByReadingsSet(
  r: ObisCatalogEntry,
  supported: Set<string>
): boolean {
  if (supported.has(r.object_code)) return true
  const fusedObisAttr = `${r.obis}.${r.attribute}`
  if (supported.has(fusedObisAttr)) return true
  const parts = r.object_code.split(".").filter((p) => p !== "")
  if (parts.length === 6 && supported.has(`${r.object_code}.${r.attribute}`)) {
    return true
  }
  return false
}
