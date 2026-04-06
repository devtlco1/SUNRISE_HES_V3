import type { ObisCatalogEntry } from "@/lib/obis/types"

const STATUS = new Set(["active", "catalog_only"])

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

/** Normalize one catalog row or return null if unusable. */
export function normalizeObisCatalogEntry(raw: unknown): ObisCatalogEntry | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const obis = str(r.obis).trim()
  if (!obis || obis.length > 64) return null
  const description = str(r.description).trim() || "—"
  const object_type = str(r.object_type, "Data").trim() || "Data"
  const pack_key = str(r.pack_key, "basic_setting").trim() || "basic_setting"
  const status = str(r.status, "catalog_only")
  if (!STATUS.has(status)) return null

  return {
    obis,
    description,
    object_type,
    class_id: num(r.class_id, 1),
    attribute: num(r.attribute, 2),
    scaler_unit_attribute: num(r.scaler_unit_attribute, 3),
    unit: str(r.unit),
    result_format: str(r.result_format, "scalar") || "scalar",
    status: status as ObisCatalogEntry["status"],
    pack_key,
    enabled: r.enabled === false ? false : true,
    sort_order: Math.max(0, Math.floor(num(r.sort_order, 0))),
    notes: r.notes !== undefined ? str(r.notes) : undefined,
  }
}

export function normalizeObisCatalogRows(input: unknown): ObisCatalogEntry[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: ObisCatalogEntry[] = []
  for (const item of input) {
    const row = normalizeObisCatalogEntry(item)
    if (!row || seen.has(row.obis)) continue
    seen.add(row.obis)
    out.push(row)
  }
  return out
}
