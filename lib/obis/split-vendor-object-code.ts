/**
 * Vendor `PRM_CODE_OBIS.ObjectCode` / `PRM_CODE_OBJECT.Code` often appends a COSEM attribute index
 * as a 7th dotted segment (e.g. `0.0.1.0.0.255.2`). Split into six-group logical name + attribute.
 */

export function splitVendorObjectCode(objectCode: string): { obis: string; attribute: number } {
  const raw = objectCode.trim()
  const parts = raw.split(".").filter((p) => p.length > 0)
  if (parts.length === 7) {
    const a = Number(parts[6])
    return {
      obis: parts.slice(0, 6).join("."),
      attribute: Number.isFinite(a) ? Math.trunc(a) : 2,
    }
  }
  if (parts.length === 6) {
    return { obis: raw, attribute: 2 }
  }
  return { obis: "", attribute: 2 }
}
