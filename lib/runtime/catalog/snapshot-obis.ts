import type { DiscoveredObjectRow } from "@/types/runtime"

/** Canonical OBIS key for set membership (trim + lowercase). */
export function normalizeObisCode(obis: string): string {
  return obis.trim().toLowerCase()
}

/**
 * Build the set of OBIS logical names present in a discovery snapshot's object list.
 */
export function supportedObisKeySetFromDiscoveryObjects(
  objects: DiscoveredObjectRow[]
): Set<string> {
  const s = new Set<string>()
  for (const row of objects) {
    const o = row.obis
    if (typeof o !== "string" || !o.trim()) continue
    s.add(normalizeObisCode(o))
  }
  return s
}

/** Deduplicate required OBIS by normalized key; preserve first spelling. */
export function dedupeRequiredObisPreserveOrder(obisList: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of obisList) {
    const t = raw.trim()
    if (!t) continue
    const k = normalizeObisCode(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}
