/**
 * Mirrors `apps/runtime-python/app/adapters/obis_selection_v1.py` for UI-only filtering
 * (e.g. "Read category" limited to rows MVP-AMI v1 will attempt on-wire).
 */

import type { ObisCatalogEntry } from "@/lib/obis/types"

export function obisSelectionRowSupportedV1Catalog(r: ObisCatalogEntry): boolean {
  if (r.attribute !== 2) return false
  const ot = (r.object_type || "").trim().toLowerCase()
  const cid = r.class_id
  if (cid === 7 || ot === "profilegeneric") return false
  if (cid === 5 || ot === "demandregister") return false
  if (ot === "clock" && cid === 1) return true
  if (ot === "register" && cid === 3) return true
  if (ot === "data" && cid === 1) return true
  return false
}
