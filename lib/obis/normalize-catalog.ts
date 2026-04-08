import {
  inferFamilySectionFromLegacyPack,
  parseFamilyTab,
  resolveFamilySectionPack,
} from "@/lib/obis/family-section"
import { INVALID_OBIS_SHAPE_NOTE, isValidCosemObisLogicalName } from "@/lib/obis/obis-logical-name"
import type { ObisCatalogEntry, ObisFamilyTab } from "@/lib/obis/types"

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
  let pack_key = str(r.pack_key, "").trim()
  const status = str(r.status, "catalog_only")
  if (!STATUS.has(status)) return null

  const obisShapeOk = isValidCosemObisLogicalName(obis)
  const priorNotes = r.notes !== undefined ? str(r.notes).trim() : ""

  const sectionFromRow = str(r.section_group ?? r.sectionGroup).trim()
  const familyParsed =
    parseFamilyTab(r.family_tab ?? r.familyTab) ??
    parseFamilyTab(r.tab_family ?? r.tabFamily)

  let family_tab: ObisFamilyTab
  let section_group: string

  if (sectionFromRow) {
    const resolved = resolveFamilySectionPack({
      familyRaw: familyParsed ?? undefined,
      sectionRaw: sectionFromRow,
    })
    family_tab = resolved.family_tab
    section_group = resolved.section_group
    if (!pack_key) pack_key = resolved.pack_key
  } else {
    const pk = pack_key || "basic_setting"
    const inf = inferFamilySectionFromLegacyPack(pk)
    family_tab = familyParsed ?? inf.family_tab
    section_group = inf.section_group
    pack_key = pk
  }

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
    family_tab,
    section_group,
    enabled: obisShapeOk ? (r.enabled === false ? false : true) : false,
    sort_order: Math.max(0, Math.floor(num(r.sort_order, 0))),
    notes: obisShapeOk
      ? priorNotes || undefined
      : [priorNotes, INVALID_OBIS_SHAPE_NOTE].filter(Boolean).join(" · "),
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
