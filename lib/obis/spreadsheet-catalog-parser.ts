/**
 * Parse OBIS catalog spreadsheets (CSV or first-sheet XLSX) with family + section support.
 * Section headings may appear as marker rows (no OBIS) or explicit FAMILY_TAB / SECTION_GROUP columns.
 */

import * as XLSX from "xlsx"

import { parseCsvToRecords } from "@/lib/obis/catalog-csv"
import { resolveKnownSection } from "@/lib/obis/family-section"
import { isValidCosemObisLogicalName } from "@/lib/obis/obis-logical-name"

export type ParsedSpreadsheetObisRow = {
  sheetRow: number
  obis: string
  description: string
  attribute: number
  rw: string
  unit: string
  /** Raw FAMILY_TAB column if present */
  family_raw?: string
  /** Raw SECTION_GROUP column or inferred section heading */
  section_raw?: string
  /** Legacy BASIC SETTING / CATEGORY column */
  legacy_basic_setting?: string
}

export type SpreadsheetObisParseSummary = {
  sheetName: string
  rawRowCount: number
  rows: ParsedSpreadsheetObisRow[]
  skippedBlank: number
  skippedInvalidObis: number
  duplicateInSheetCollapsed: number
  duplicateDescriptionMismatches: number
  parseWarnings: string[]
}

function normHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase()
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return String(v).replace(/\s+/g, " ").trim()
}

function cellInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return fallback
}

function looksLikeSectionMarker(obisCell: string, firstCell: string): boolean {
  if (obisCell.trim()) return false
  const a = firstCell.trim()
  if (!a || a.includes(".")) return false
  if (resolveKnownSection(a)) return true
  const u = normHeader(a)
  return u.length >= 6 && /^[A-Z0-9 /&\-]+$/.test(u) && !/\d+\.\d+\.\d+/.test(a)
}

function isLikelyCsv(buffer: Buffer, filename: string): boolean {
  const n = filename.toLowerCase()
  if (n.endsWith(".csv")) return true
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return false
  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString("utf8")
  return !head.includes("\0") && /OBIS|FAMILY_TAB|SECTION_GROUP/i.test(head)
}

function mergeParsedFields(
  row: Record<string, unknown>,
  overrides?: Partial<ParsedSpreadsheetObisRow>
): Omit<ParsedSpreadsheetObisRow, "sheetRow"> {
  const map = new Map<string, unknown>()
  for (const [k, v] of Object.entries(row)) {
    map.set(normHeader(k), v)
  }
  const get = (...aliases: string[]) => {
    for (const a of aliases) {
      const v = map.get(normHeader(a))
      if (v !== undefined && v !== "") return v
    }
    return undefined
  }
  const obis = cellStr(get("OBIS"))
  const description = cellStr(get("DESCRIPTION"))
  const attribute = cellInt(get("ATTRIBUTES", "ATTRIBUTE"), 2)
  const rw = cellStr(get("R/W", "RW"))
  const unit = cellStr(get("UNIT"))
  const family_col = cellStr(get("FAMILY_TAB", "TAB", "FAMILY"))
  const section_col = cellStr(get("SECTION_GROUP", "SECTION", "GROUP"))
  const legacy_basic_setting = cellStr(
    get("BASIC SETTING", "BASIC_SETTING", "CATEGORY", "PACK")
  )
  return {
    obis,
    description,
    attribute,
    rw: rw || "—",
    unit,
    family_raw: family_col || overrides?.family_raw,
    section_raw: section_col || overrides?.section_raw,
    legacy_basic_setting: legacy_basic_setting || undefined,
  }
}

export function parseObisCatalogCsvBuffer(
  buffer: Buffer,
  parseWarnings: string[]
): SpreadsheetObisParseSummary {
  const text = buffer.toString("utf8")
  const { rows: records, errors, headers } = parseCsvToRecords(text)
  for (const e of errors) parseWarnings.push(e)

  const byKey = new Map<string, ParsedSpreadsheetObisRow>()
  let skippedBlank = 0
  let skippedInvalidObis = 0
  let duplicateInSheetCollapsed = 0
  let duplicateDescriptionMismatches = 0

  let currentSection: string | undefined
  let currentFamily: string | undefined

  records.forEach((rec, idx) => {
    const sheetRow = idx + 2
    const row = rec as unknown as Record<string, unknown>
    const firstHeader = headers[0] ?? ""
    const firstStr = firstHeader ? String(rec[firstHeader] ?? "").trim() : ""
    const f = mergeParsedFields(row, {
      section_raw: currentSection,
      family_raw: currentFamily,
    })
    if (!f.obis) {
      if (looksLikeSectionMarker("", firstStr)) {
        currentSection = firstStr.trim()
        const kn = resolveKnownSection(currentSection)
        if (kn) currentFamily = kn.family_tab
        skippedBlank += 1
        return
      }
      skippedBlank += 1
      return
    }
    if (!isValidCosemObisLogicalName(f.obis)) {
      skippedInvalidObis += 1
      return
    }
    const key = `${f.obis.trim()}::${f.attribute}`
    const prev = byKey.get(key)
    if (prev) {
      duplicateInSheetCollapsed += 1
      const a = prev.description.trim().toLowerCase()
      const b = f.description.trim().toLowerCase()
      if (a && b && a !== b) duplicateDescriptionMismatches += 1
      return
    }
    if (f.section_raw || f.legacy_basic_setting) {
      currentSection = undefined
      currentFamily = undefined
    }
    byKey.set(key, { sheetRow, ...f })
  })

  const rows = [...byKey.values()].sort((a, b) => {
    const sa = (a.section_raw ?? "").localeCompare(b.section_raw ?? "")
    if (sa !== 0) return sa
    return a.obis.localeCompare(b.obis)
  })

  return {
    sheetName: "CSV",
    rawRowCount: records.length,
    rows,
    skippedBlank,
    skippedInvalidObis,
    duplicateInSheetCollapsed,
    duplicateDescriptionMismatches,
    parseWarnings,
  }
}

export function parseObisCatalogXlsxBuffer(
  buffer: Buffer,
  parseWarnings: string[]
): SpreadsheetObisParseSummary {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false })
  const sheetName = wb.SheetNames[0] ?? "Sheet1"
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return {
      sheetName,
      rawRowCount: 0,
      rows: [],
      skippedBlank: 0,
      skippedInvalidObis: 0,
      duplicateInSheetCollapsed: 0,
      duplicateDescriptionMismatches: 0,
      parseWarnings,
    }
  }

  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][]

  let headerRowIdx = -1
  const normCell = (c: unknown) => cellStr(c).toUpperCase()
  for (let i = 0; i < Math.min(aoa.length, 80); i++) {
    const row = aoa[i] as unknown[] | undefined
    if (!row) continue
    if (row.some((c) => normCell(c) === "OBIS")) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx < 0) {
    parseWarnings.push("XLSX: could not find a header row containing OBIS.")
    return {
      sheetName,
      rawRowCount: aoa.length,
      rows: [],
      skippedBlank: 0,
      skippedInvalidObis: 0,
      duplicateInSheetCollapsed: 0,
      duplicateDescriptionMismatches: 0,
      parseWarnings,
    }
  }

  const headerRow = (aoa[headerRowIdx] as unknown[]) ?? []
  const colIndex = new Map<string, number>()
  headerRow.forEach((cell, j) => {
    const h = normHeader(cellStr(cell))
    if (h && !colIndex.has(h)) colIndex.set(h, j)
  })

  const getCell = (row: unknown[], aliases: string[]) => {
    for (const a of aliases) {
      const j = colIndex.get(normHeader(a))
      if (j !== undefined) return row[j]
    }
    return undefined
  }

  const byKey = new Map<string, ParsedSpreadsheetObisRow>()
  let skippedBlank = 0
  let skippedInvalidObis = 0
  let duplicateInSheetCollapsed = 0
  let duplicateDescriptionMismatches = 0

  let currentSection: string | undefined
  let currentFamily: string | undefined

  for (let ri = headerRowIdx + 1; ri < aoa.length; ri++) {
    const row = (aoa[ri] as unknown[]) ?? []
    const sheetRow = ri + 1
    const obis = cellStr(getCell(row, ["OBIS"]))
    const firstCol = cellStr(row[0])

    if (!obis) {
      if (looksLikeSectionMarker("", firstCol)) {
        currentSection = firstCol.trim()
        const kn = resolveKnownSection(currentSection)
        if (kn) currentFamily = kn.family_tab
        skippedBlank += 1
        continue
      }
      skippedBlank += 1
      continue
    }

    const record: Record<string, unknown> = {}
    headerRow.forEach((h, j) => {
      const key = cellStr(h)
      if (key) record[key] = row[j]
    })

    const f = mergeParsedFields(record, {
      section_raw: currentSection,
      family_raw: currentFamily,
    })

    if (!isValidCosemObisLogicalName(f.obis)) {
      skippedInvalidObis += 1
      continue
    }

    const key = `${f.obis.trim()}::${f.attribute}`
    const prev = byKey.get(key)
    if (prev) {
      duplicateInSheetCollapsed += 1
      const a = prev.description.trim().toLowerCase()
      const b = f.description.trim().toLowerCase()
      if (a && b && a !== b) duplicateDescriptionMismatches += 1
      continue
    }

    if (f.section_raw || f.legacy_basic_setting) {
      currentSection = undefined
      currentFamily = undefined
    }

    byKey.set(key, { sheetRow, ...f })
  }

  const rows = [...byKey.values()].sort((a, b) => {
    const sa = (a.section_raw ?? "").localeCompare(b.section_raw ?? "")
    if (sa !== 0) return sa
    return a.obis.localeCompare(b.obis)
  })

  return {
    sheetName,
    rawRowCount: aoa.length,
    rows,
    skippedBlank,
    skippedInvalidObis,
    duplicateInSheetCollapsed,
    duplicateDescriptionMismatches,
    parseWarnings,
  }
}

export function parseObisCatalogSpreadsheetBuffer(
  buffer: Buffer,
  filename: string
): SpreadsheetObisParseSummary {
  const parseWarnings: string[] = []
  if (isLikelyCsv(buffer, filename)) {
    return parseObisCatalogCsvBuffer(buffer, parseWarnings)
  }
  return parseObisCatalogXlsxBuffer(buffer, parseWarnings)
}
