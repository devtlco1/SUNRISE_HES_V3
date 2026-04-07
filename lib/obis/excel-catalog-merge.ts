/**
 * Smart merge: Excel = trusted meter-supported OBIS list; existing JSON = app metadata (pack, sort, notes).
 */

import { normalizeObisCatalogEntry } from "@/lib/obis/normalize-catalog"
import type { ObisCatalogEntry, ObisPackKey } from "@/lib/obis/types"
import { OBIS_PACK_ORDER } from "@/lib/obis/types"

import {
  parseMeterObisExcelWorkbook,
  type ParsedExcelObisRow,
} from "./excel-catalog-parser"

export const CANONICAL_SERIAL_OBIS = "0.0.96.1.0.255"
export const AUX_IDENTITY_OBIS = "0.0.96.1.1.255"

export type ExcelCatalogMergeSummary = {
  existingCount: number
  excelDistinctRows: number
  updated: number
  inserted: number
  unchanged: number
  skippedInvalidObis: number
  duplicateInSheetCollapsed: number
  duplicateDescriptionMismatches: number
  attributeMismatchWarnings: number
  sheetName: string
  rawRowCount: number
}

const BASIC_SETTING_TO_PACK: Record<string, ObisPackKey> = {
  "INSTANTANEOUS VALUE": "instantaneous",
  "MAXIMUM MDI": "demand",
  "ENERGY REGISTER": "energy",
  "CURRENT MDU": "demand",
  "HISTORY ENERGY": "energy",
  "BILING PERIOD ENERGY": "energy",
}

function packFromBasicSetting(label: string): ObisPackKey {
  const k = label.trim().toUpperCase()
  return BASIC_SETTING_TO_PACK[k] ?? "basic_setting"
}

function inferClassAndObjectType(obis: string): { class_id: number; object_type: string } {
  if (obis === "0.0.1.0.0.255") return { class_id: 1, object_type: "Clock" }
  const third = obis.split(".")[2] ?? ""
  if (third === "96" || third === "42" || third === "43") {
    return { class_id: 1, object_type: "Data" }
  }
  return { class_id: 3, object_type: "Register" }
}

function sortCatalogRows(rows: ObisCatalogEntry[]): ObisCatalogEntry[] {
  const packIdx = (k: string) => {
    const i = OBIS_PACK_ORDER.indexOf(k)
    return i >= 0 ? i : 999
  }
  return [...rows].sort((a, b) => {
    const dp = packIdx(a.pack_key) - packIdx(b.pack_key)
    if (dp !== 0) return dp
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.obis.localeCompare(b.obis)
  })
}

function appendRwNote(notes: string | undefined, rw: string): string | undefined {
  const tag = `Excel R/W: ${rw}`
  const base = (notes ?? "").trim()
  if (!base) return tag
  if (base.includes(tag)) return base
  return `${base} · ${tag}`
}

function mergeIdentityNotes(
  obis: string,
  prevNotes: string | undefined,
  rw: string,
  excelSection: string
): string | undefined {
  const rwPart = `Excel R/W: ${rw}`
  const sectionPart =
    excelSection.trim() && excelSection.trim().toUpperCase() !== "OPTIONS"
      ? `Excel section: ${excelSection.trim()}`
      : ""
  const extra = [sectionPart, rwPart].filter(Boolean).join(" · ")
  const base = (prevNotes ?? "").trim()

  if (obis === CANONICAL_SERIAL_OBIS) {
    if (base.includes("IdentityPayload.serialNumber") || base.includes("canonical")) {
      return base.includes(rwPart) ? base : `${base} · ${extra}`.replace(/ · · /g, " · ")
    }
    return base
      ? `${base} · ${extra}`.replace(/ · · /g, " · ")
      : `Canonical serial from 0.0.96.1.0.255 (identity read). ${extra}`
  }

  if (obis === AUX_IDENTITY_OBIS) {
    if (base.includes("IdentityPayload.logicalDeviceName") || base.includes("Auxiliary")) {
      return base.includes(rwPart) ? base : `${base} · ${extra}`.replace(/ · · /g, " · ")
    }
    return base
      ? `${base} · ${extra}`.replace(/ · · /g, " · ")
      : `Auxiliary identity 0.0.96.1.1.255. ${extra}`
  }

  const withRw = appendRwNote(prevNotes, rw)
  if (
    excelSection.trim() &&
    excelSection.trim().toUpperCase() !== "OPTIONS"
  ) {
    const sec = `Excel section: ${excelSection.trim()}`
    if ((withRw ?? "").includes(sec)) return withRw || undefined
    return withRw ? `${withRw} · ${sec}` : sec
  }
  return withRw || undefined
}

/**
 * Merge parsed Excel rows into the persisted catalog.
 * - Match primarily by OBIS (catalog is one row per OBIS today).
 * - Preserve pack_key, sort_order, enabled, status, result_format, scaler_unit_attribute, class_id, object_type on update
 *     except when inserting new rows (full infer) or when attribute mismatch is noted.
 * - Description + unit come from Excel on update.
 */
export function mergeExcelObisIntoCatalog(
  existing: ObisCatalogEntry[],
  parseSummary: {
    sheetName: string
    rawRowCount: number
    rows: ParsedExcelObisRow[]
    skippedInvalidObis: number
    duplicateInSheetCollapsed: number
    duplicateDescriptionMismatches: number
  }
): { rows: ObisCatalogEntry[]; summary: ExcelCatalogMergeSummary } {
  const byObis = new Map<string, ObisCatalogEntry>()
  for (const r of existing) {
    byObis.set(r.obis.trim(), { ...r })
  }

  const maxSortByPack = new Map<string, number>()
  for (const r of byObis.values()) {
    const pk = r.pack_key
    maxSortByPack.set(pk, Math.max(maxSortByPack.get(pk) ?? 0, r.sort_order))
  }

  let updated = 0
  let inserted = 0
  let unchanged = 0
  let attributeMismatchWarnings = 0

  for (const ex of parseSummary.rows) {
    const obis = ex.obis.trim()
    const cur = byObis.get(obis)
    const excelPack = packFromBasicSetting(ex.basicSetting)

    if (cur) {
      let notes = mergeIdentityNotes(obis, cur.notes, ex.rw, ex.basicSetting)
      if (cur.attribute !== ex.attribute) {
        attributeMismatchWarnings += 1
        const warn = `Catalog attribute=${cur.attribute}; Excel ATTRIBUTES=${ex.attribute} (catalog kept for safety)`
        notes = notes ? `${notes} · ${warn}` : warn
      }
      const next: ObisCatalogEntry = {
        ...cur,
        description: ex.description || cur.description,
        unit: ex.unit,
        notes: notes || undefined,
      }
      const changed =
        next.description !== cur.description ||
        next.unit !== cur.unit ||
        (next.notes ?? "") !== (cur.notes ?? "")
      byObis.set(obis, next)
      if (changed) updated += 1
      else unchanged += 1
    } else {
      const inf = inferClassAndObjectType(obis)
      const pack = excelPack
      const nextSort = (maxSortByPack.get(pack) ?? 0) + 1
      maxSortByPack.set(pack, nextSort)
      const raw = {
        obis,
        description: ex.description || "—",
        object_type: inf.object_type,
        class_id: inf.class_id,
        attribute: ex.attribute,
        scaler_unit_attribute: 3,
        unit: ex.unit,
        result_format: "scalar",
        status: "active" as const,
        pack_key: pack,
        enabled: true,
        sort_order: nextSort,
        notes: `Meter-supported Excel import. ${ex.basicSetting ? `Section: ${ex.basicSetting}. ` : ""}R/W=${ex.rw}`,
      }
      const norm = normalizeObisCatalogEntry(raw)
      if (norm) {
        byObis.set(obis, norm)
        inserted += 1
      }
    }
  }

  const rows = sortCatalogRows([...byObis.values()])

  return {
    rows,
    summary: {
      existingCount: existing.length,
      excelDistinctRows: parseSummary.rows.length,
      updated,
      inserted,
      unchanged,
      skippedInvalidObis: parseSummary.skippedInvalidObis,
      duplicateInSheetCollapsed: parseSummary.duplicateInSheetCollapsed,
      duplicateDescriptionMismatches: parseSummary.duplicateDescriptionMismatches,
      attributeMismatchWarnings,
      sheetName: parseSummary.sheetName,
      rawRowCount: parseSummary.rawRowCount,
    },
  }
}

export function mergeExcelWorkbookBufferIntoCatalog(
  existing: ObisCatalogEntry[],
  workbookBuffer: Buffer
): { rows: ObisCatalogEntry[]; summary: ExcelCatalogMergeSummary } {
  const parsed = parseMeterObisExcelWorkbook(workbookBuffer)
  return mergeExcelObisIntoCatalog(existing, parsed)
}
