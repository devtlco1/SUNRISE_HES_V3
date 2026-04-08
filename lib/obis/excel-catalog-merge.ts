/**
 * Merge spreadsheet rows (CSV / XLSX) into persisted OBIS catalog.
 * Excel = trusted meter-supported OBIS list; preserves / updates family_tab, section_group, pack_key.
 */

import { resolveFamilySectionPack } from "@/lib/obis/family-section"
import { normalizeObisCatalogEntry } from "@/lib/obis/normalize-catalog"
import {
  parseObisCatalogSpreadsheetBuffer,
  type ParsedSpreadsheetObisRow,
} from "@/lib/obis/spreadsheet-catalog-parser"
import type { ObisCatalogEntry, ObisFamilyTab, ObisPackKey } from "@/lib/obis/types"
import { OBIS_PACK_ORDER } from "@/lib/obis/types"

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
  parseWarnings: string[]
}

function inferClassAndObjectType(obis: string): { class_id: number; object_type: string } {
  if (obis === "0.0.1.0.0.255") return { class_id: 1, object_type: "Clock" }
  const third = obis.split(".")[2] ?? ""
  if (third === "96" || third === "42" || third === "43") {
    return { class_id: 1, object_type: "Data" }
  }
  return { class_id: 3, object_type: "Register" }
}

const FAMILY_ORDER: Record<ObisFamilyTab, number> = {
  basic: 0,
  energy: 1,
  profile: 2,
}

function sortCatalogRows(rows: ObisCatalogEntry[]): ObisCatalogEntry[] {
  const packIdx = (k: string) => {
    const i = OBIS_PACK_ORDER.indexOf(k)
    return i >= 0 ? i : 999
  }
  return [...rows].sort((a, b) => {
    const df = FAMILY_ORDER[a.family_tab] - FAMILY_ORDER[b.family_tab]
    if (df !== 0) return df
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
  sectionLabel: string
): string | undefined {
  const rwPart = `Excel R/W: ${rw}`
  const sectionPart =
    sectionLabel.trim() && sectionLabel.trim().toUpperCase() !== "OPTIONS"
      ? `Excel section: ${sectionLabel.trim()}`
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
  if (sectionLabel.trim() && sectionLabel.trim().toUpperCase() !== "OPTIONS") {
    const sec = `Excel section: ${sectionLabel.trim()}`
    if ((withRw ?? "").includes(sec)) return withRw || undefined
    return withRw ? `${withRw} · ${sec}` : sec
  }
  return withRw || undefined
}

export function mergeSpreadsheetObisIntoCatalog(
  existing: ObisCatalogEntry[],
  parseSummary: {
    sheetName: string
    rawRowCount: number
    rows: ParsedSpreadsheetObisRow[]
    skippedInvalidObis: number
    duplicateInSheetCollapsed: number
    duplicateDescriptionMismatches: number
    parseWarnings: string[]
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
    const resolved = resolveFamilySectionPack({
      familyRaw: ex.family_raw,
      sectionRaw: ex.section_raw,
      legacyBasicSettingColumn: ex.legacy_basic_setting,
    })
    const family_tab = resolved.family_tab
    const section_group = resolved.section_group
    const pack_key = resolved.pack_key as ObisPackKey

    if (cur) {
      let notes = mergeIdentityNotes(obis, cur.notes, ex.rw, section_group)
      if (cur.attribute !== ex.attribute) {
        attributeMismatchWarnings += 1
        const warn = `Catalog attribute=${cur.attribute}; sheet ATTRIBUTES=${ex.attribute} (catalog kept for safety)`
        notes = notes ? `${notes} · ${warn}` : warn
      }
      const next: ObisCatalogEntry = {
        ...cur,
        description: ex.description || cur.description,
        unit: ex.unit,
        family_tab,
        section_group,
        pack_key,
        notes: notes || undefined,
      }
      const changed =
        next.description !== cur.description ||
        next.unit !== cur.unit ||
        next.family_tab !== cur.family_tab ||
        next.section_group !== cur.section_group ||
        next.pack_key !== cur.pack_key ||
        (next.notes ?? "") !== (cur.notes ?? "")
      byObis.set(obis, next)
      if (changed) updated += 1
      else unchanged += 1
    } else {
      const inf = inferClassAndObjectType(obis)
      const pack = pack_key
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
        family_tab,
        section_group,
        enabled: true,
        sort_order: nextSort,
        notes: `Spreadsheet import. ${section_group}. R/W=${ex.rw}`,
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
      parseWarnings: parseSummary.parseWarnings,
    },
  }
}

export function mergeSpreadsheetBufferIntoCatalog(
  existing: ObisCatalogEntry[],
  workbookBuffer: Buffer,
  filename: string
): { rows: ObisCatalogEntry[]; summary: ExcelCatalogMergeSummary } {
  const parsed = parseObisCatalogSpreadsheetBuffer(workbookBuffer, filename)
  return mergeSpreadsheetObisIntoCatalog(existing, parsed)
}

/** @deprecated use mergeSpreadsheetBufferIntoCatalog */
export function mergeExcelWorkbookBufferIntoCatalog(
  existing: ObisCatalogEntry[],
  workbookBuffer: Buffer
): { rows: ObisCatalogEntry[]; summary: ExcelCatalogMergeSummary } {
  return mergeSpreadsheetBufferIntoCatalog(existing, workbookBuffer, "upload.xlsx")
}
