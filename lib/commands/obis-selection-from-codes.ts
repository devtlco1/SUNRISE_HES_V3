import type { ObisCatalogEntry } from "@/lib/obis/types"
import type { ObisSelectionItemInput } from "@/types/runtime"

/** Build Python read-obis-selection items from PRM catalog rows (object_code keys). */
export function catalogEntriesToSelectionItems(
  objectCodes: string[],
  catalog: ObisCatalogEntry[]
): ObisSelectionItemInput[] {
  const byCode = new Map(catalog.map((e) => [e.object_code, e]))
  const out: ObisSelectionItemInput[] = []
  for (const code of objectCodes) {
    const e = byCode.get(code)
    if (!e) continue
    if (!e.enabled) continue
    out.push({
      obis: e.obis,
      objectType: e.object_type,
      classId: e.class_id,
      attribute: e.attribute,
      scalerUnitAttribute: e.scaler_unit_attribute,
      unit: e.unit || undefined,
      objectCode: e.object_code,
      description: e.object_name || e.description,
    })
  }
  return out
}
