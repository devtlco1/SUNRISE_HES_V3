/**
 * Merge spreadsheet rows (CSV / XLSX) into persisted OBIS catalog (vendor-shaped rows).
 */

import { normalizeObisCatalogEntry } from "@/lib/obis/normalize-catalog"
import { parseObisCatalogSpreadsheetBuffer } from "@/lib/obis/spreadsheet-catalog-parser"
import type { ObisCatalogEntry } from "@/lib/obis/types"

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

function sortCatalogRows(rows: ObisCatalogEntry[]): ObisCatalogEntry[] {
  return [...rows].sort((a, b) => {
    const c = a.class_name.localeCompare(b.class_name)
    if (c !== 0) return c
    const s = a.subclass_name.localeCompare(b.subclass_name)
    if (s !== 0) return s
    if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no
    return a.object_code.localeCompare(b.object_code)
  })
}

export function mergeSpreadsheetObisIntoCatalog(
  existing: ObisCatalogEntry[],
  parseSummary: ReturnType<typeof parseObisCatalogSpreadsheetBuffer>
): { rows: ObisCatalogEntry[]; summary: ExcelCatalogMergeSummary } {
  const byCode = new Map(existing.map((r) => [r.object_code, { ...r }]))

  let updated = 0
  let inserted = 0
  let unchanged = 0
  let attributeMismatchWarnings = 0

  for (const raw of parseSummary.rows) {
    const row = normalizeObisCatalogEntry(raw)
    if (!row) {
      continue
    }
    const cur = byCode.get(row.object_code)
    if (cur) {
      if (cur.attribute !== row.attribute) {
        attributeMismatchWarnings += 1
      }
      const next: ObisCatalogEntry = { ...cur, ...row, object_code: row.object_code }
      const changed = JSON.stringify(next) !== JSON.stringify(cur)
      byCode.set(row.object_code, next)
      if (changed) updated += 1
      else unchanged += 1
    } else {
      byCode.set(row.object_code, row)
      inserted += 1
    }
  }

  const rows = sortCatalogRows([...byCode.values()])

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

export function mergeExcelWorkbookBufferIntoCatalog(
  existing: ObisCatalogEntry[],
  workbookBuffer: Buffer
): { rows: ObisCatalogEntry[]; summary: ExcelCatalogMergeSummary } {
  return mergeSpreadsheetBufferIntoCatalog(existing, workbookBuffer, "upload.xlsx")
}
