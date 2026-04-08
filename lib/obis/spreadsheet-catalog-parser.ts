/**
 * Parse OBIS catalog spreadsheets (CSV or first-sheet XLSX) into raw row objects
 * consumable by `normalizeObisCatalogEntry`.
 */

import * as XLSX from "xlsx"

import { parseCsvToRecords } from "@/lib/obis/catalog-csv"
import { isValidCosemObisLogicalName } from "@/lib/obis/obis-logical-name"
import { splitVendorObjectCode } from "@/lib/obis/split-vendor-object-code"

export type SpreadsheetObisParseSummary = {
  sheetName: string
  rawRowCount: number
  rows: Record<string, unknown>[]
  skippedInvalidObis: number
  duplicateInSheetCollapsed: number
  duplicateDescriptionMismatches: number
  parseWarnings: string[]
}

function normHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase().replace(/\s+/g, "_")
}

function rowRecordToCatalogRaw(rec: Record<string, string>): Record<string, unknown> | null {
  const m = new Map<string, string>()
  for (const [k, v] of Object.entries(rec)) {
    m.set(normHeader(k), v.trim())
  }
  const g = (...keys: string[]) => {
    for (const k of keys) {
      const v = m.get(normHeader(k))
      if (v !== undefined && v !== "") return v
    }
    return ""
  }

  let object_code = g("OBJECT_CODE", "OBJECTCODE")
  const obisIn = g("OBIS")
  const attrStr = g("ATTRIBUTE", "ATTRIBUTES")
  const attributeNum = attrStr ? Math.floor(Number(attrStr)) : NaN

  if (!object_code && obisIn) {
    const parts = obisIn.split(".").filter(Boolean)
    if (parts.length === 7) {
      object_code = obisIn
    } else if (isValidCosemObisLogicalName(obisIn)) {
      const a = Number.isFinite(attributeNum) ? attributeNum : 2
      object_code = `${obisIn}.${a}`
    } else {
      return null
    }
  }

  if (!object_code) return null

  const split = splitVendorObjectCode(object_code)
  const obis =
    obisIn && isValidCosemObisLogicalName(obisIn) ? obisIn : split.obis
  if (!isValidCosemObisLogicalName(obis)) return null

  return {
    object_code,
    obis,
    description: g("DESCRIPTION", "OBJECT_NAME", "NAME") || g("OBJECT_NAME") || split.obis,
    object_name: g("OBJECT_NAME", "NAME") || g("DESCRIPTION"),
    class_name: g("CLASS_NAME", "CLASSNAME", "CLASS"),
    subclass_name: g("SUBCLASS_NAME", "SUBCLASSNAME", "SUBCLASS"),
    sort_no: g("SORT_NO", "SORTNO", "SORT_ORDER") || "0",
    protocol: g("PROTOCOL") || "2",
    obis_hex: g("OBIS_HEX", "OBISHEX"),
    data_type: g("DATA_TYPE", "DATATYPE"),
    analytic_type: g("ANALYTIC_TYPE", "ANALYTICTYPE"),
    unit: g("UNIT"),
    scaler: g("SCALER") || "0",
    read_batch_status: g("READ_BATCH_STATUS"),
    read_single_status: g("READ_SINGLE_STATUS"),
    collect_plan_status: g("COLLECT_PLAN_STATUS"),
    collect_plan_type_status: g("COLLECT_PLAN_TYPE_STATUS"),
    setting_status: g("SETTING_STATUS"),
    display_status: g("DISPLAY_STATUS"),
    phase: g("PHASE"),
    device_type: g("DEVICE_TYPE", "DEVICETYPE"),
    object_type: g("OBJECT_TYPE", "OBJECTTYPE"),
    class_id: g("CLASS_ID", "CLASSID"),
    attribute: attrStr || String(split.attribute),
    scaler_unit_attribute: g("SCALER_UNIT_ATTRIBUTE") || "3",
    result_format: g("RESULT_FORMAT") || "scalar",
    status: g("STATUS") || "catalog_only",
    enabled: g("ENABLED") || "true",
    notes: g("NOTES"),
  }
}

function isLikelyCsv(buffer: Buffer, filename: string): boolean {
  const n = filename.toLowerCase()
  if (n.endsWith(".csv")) return true
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return false
  const head = buffer.subarray(0, Math.min(256, buffer.length)).toString("utf8")
  return !head.includes("\0") && /OBJECT_CODE|OBIS|CLASS_NAME/i.test(head)
}

export function parseObisCatalogSpreadsheetBuffer(
  buffer: Buffer,
  filename: string
): SpreadsheetObisParseSummary {
  const parseWarnings: string[] = []
  if (isLikelyCsv(buffer, filename)) {
    const text = buffer.toString("utf8")
    const { rows: records, errors } = parseCsvToRecords(text)
    for (const e of errors) parseWarnings.push(e)
    const rows: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let skippedInvalidObis = 0
    let duplicateInSheetCollapsed = 0
    let duplicateDescriptionMismatches = 0
    for (const rec of records) {
      const raw = rowRecordToCatalogRaw(rec as Record<string, string>)
      if (!raw) {
        skippedInvalidObis += 1
        continue
      }
      const oc = String(raw.object_code)
      if (seen.has(oc)) {
        duplicateInSheetCollapsed += 1
        continue
      }
      seen.add(oc)
      rows.push(raw)
    }
    return {
      sheetName: "CSV",
      rawRowCount: records.length,
      rows,
      skippedInvalidObis,
      duplicateInSheetCollapsed,
      duplicateDescriptionMismatches,
      parseWarnings,
    }
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false })
  const sheetName = wb.SheetNames[0] ?? "Sheet1"
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return {
      sheetName,
      rawRowCount: 0,
      rows: [],
      skippedInvalidObis: 0,
      duplicateInSheetCollapsed: 0,
      duplicateDescriptionMismatches: 0,
      parseWarnings: ["Empty workbook"],
    }
  }
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][]
  if (aoa.length < 2) {
    return {
      sheetName,
      rawRowCount: 0,
      rows: [],
      skippedInvalidObis: 0,
      duplicateInSheetCollapsed: 0,
      duplicateDescriptionMismatches: 0,
      parseWarnings: ["Sheet has no data rows"],
    }
  }
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim())
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let skippedInvalidObis = 0
  let duplicateInSheetCollapsed = 0
  let duplicateDescriptionMismatches = 0
  for (let ri = 1; ri < aoa.length; ri++) {
    const line = aoa[ri] ?? []
    const rec: Record<string, string> = {}
    for (let ci = 0; ci < headers.length; ci++) {
      const h = headers[ci]
      if (!h) continue
      rec[h] = String(line[ci] ?? "").trim()
    }
    const raw = rowRecordToCatalogRaw(rec)
    if (!raw) {
      skippedInvalidObis += 1
      continue
    }
    const oc = String(raw.object_code)
    if (seen.has(oc)) {
      duplicateInSheetCollapsed += 1
      continue
    }
    seen.add(oc)
    rows.push(raw)
  }
  return {
    sheetName,
    rawRowCount: aoa.length - 1,
    rows,
    skippedInvalidObis,
    duplicateInSheetCollapsed,
    duplicateDescriptionMismatches,
    parseWarnings,
  }
}
