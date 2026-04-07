/**
 * Parse meter OBIS worksheets (columns OBIS, DESCRIPTION, ATTRIBUTES, R/W, UNIT, …).
 * Server-only; depends on `xlsx`.
 */

import * as XLSX from "xlsx"

import { isValidCosemObisLogicalName } from "@/lib/obis/obis-logical-name"

export type ParsedExcelObisRow = {
  sheetRow: number
  obis: string
  description: string
  attribute: number
  rw: string
  unit: string
  basicSetting: string
}

export type ExcelObisParseSummary = {
  sheetName: string
  rawRowCount: number
  rows: ParsedExcelObisRow[]
  skippedBlank: number
  skippedInvalidObis: number
  duplicateInSheetCollapsed: number
  duplicateDescriptionMismatches: number
}

function normHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase()
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function cellInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return fallback
}

/** Map raw sheet row (varying column labels) to known fields. */
function rowToFields(row: Record<string, unknown>): {
  obis: string
  description: string
  attribute: number
  rw: string
  unit: string
  basicSetting: string
} {
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
  return {
    obis: cellStr(get("OBIS")),
    description: cellStr(get("DESCRIPTION")),
    attribute: cellInt(get("ATTRIBUTES"), 2),
    rw: cellStr(get("R/W", "RW")),
    unit: cellStr(get("UNIT")),
    basicSetting: cellStr(get("BASIC SETTING", "BASIC_SETTING", "PACK", "CATEGORY")),
  }
}

/**
 * Parse first worksheet of an .xlsx buffer.
 * Deduplicates by OBIS + attribute (first row wins); later duplicates with different description increment mismatch counter.
 */
export function parseMeterObisExcelWorkbook(buffer: Buffer): ExcelObisParseSummary {
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
    }
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
  const byKey = new Map<string, ParsedExcelObisRow>()
  let skippedBlank = 0
  let skippedInvalidObis = 0
  let duplicateInSheetCollapsed = 0
  let duplicateDescriptionMismatches = 0

  raw.forEach((rec, idx) => {
    const sheetRow = idx + 2
    const f = rowToFields(rec)
    if (!f.obis) {
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
    byKey.set(key, {
      sheetRow,
      obis: f.obis.trim(),
      description: f.description.trim() || "—",
      attribute: f.attribute,
      rw: f.rw || "—",
      unit: f.unit,
      basicSetting: f.basicSetting.trim(),
    })
  })

  const rows = [...byKey.values()].sort((a, b) => {
    const pa = a.basicSetting.localeCompare(b.basicSetting)
    if (pa !== 0) return pa
    return a.obis.localeCompare(b.obis)
  })

  return {
    sheetName,
    rawRowCount: raw.length,
    rows,
    skippedBlank,
    skippedInvalidObis,
    duplicateInSheetCollapsed,
    duplicateDescriptionMismatches,
  }
}
