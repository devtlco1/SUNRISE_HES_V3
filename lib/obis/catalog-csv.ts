/**
 * CSV export/import helpers for vendor-shaped OBIS catalog.
 */

import type { ObisCatalogEntry } from "@/lib/obis/types"

export const OBIS_CATALOG_CSV_HEADERS_FULL = [
  "OBJECT_CODE",
  "OBIS",
  "CLASS_NAME",
  "SUBCLASS_NAME",
  "OBJECT_NAME",
  "SORT_NO",
  "PROTOCOL",
  "OBIS_HEX",
  "DATA_TYPE",
  "ANALYTIC_TYPE",
  "UNIT",
  "SCALER",
  "READ_BATCH_STATUS",
  "READ_SINGLE_STATUS",
  "COLLECT_PLAN_STATUS",
  "COLLECT_PLAN_TYPE_STATUS",
  "SETTING_STATUS",
  "DISPLAY_STATUS",
  "PHASE",
  "DEVICE_TYPE",
  "OBJECT_TYPE",
  "CLASS_ID",
  "ATTRIBUTE",
  "SCALER_UNIT_ATTRIBUTE",
  "RESULT_FORMAT",
  "STATUS",
  "ENABLED",
  "NOTES",
] as const

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
  return cell
}

export function catalogRowsToCsv(rows: ObisCatalogEntry[], _full = true): string {
  const headers = [...OBIS_CATALOG_CSV_HEADERS_FULL]
  const lines = [headers.join(",")]
  for (const r of rows) {
    const cells = [
      r.object_code,
      r.obis,
      r.class_name,
      r.subclass_name,
      r.object_name,
      String(r.sort_no),
      r.protocol,
      r.obis_hex,
      r.data_type,
      r.analytic_type,
      r.unit,
      String(r.scaler),
      r.read_batch_status,
      r.read_single_status,
      r.collect_plan_status,
      r.collect_plan_type_status,
      r.setting_status,
      r.display_status,
      r.phase,
      r.device_type,
      r.object_type,
      String(r.class_id),
      String(r.attribute),
      String(r.scaler_unit_attribute),
      r.result_format,
      r.status,
      r.enabled ? "true" : "false",
      r.notes ?? "",
    ]
    lines.push(cells.map(csvEscape).join(","))
  }
  return `${lines.join("\n")}\n`
}

export function obisCatalogCsvTemplate(): string {
  const h = [...OBIS_CATALOG_CSV_HEADERS_FULL]
  const r1 = [
    "0.0.1.0.0.255.2",
    "0.0.1.0.0.255",
    "Basic",
    "",
    "DATA_TIME",
    "0",
    "2",
    "00080000010000FF02",
    "25",
    "DATETIME",
    "",
    "0",
    "0",
    "0",
    "0",
    "0",
    "1",
    "0",
    "1",
    "2",
    "clock",
    "1",
    "2",
    "3",
    "scalar",
    "catalog_only",
    "true",
    "",
  ]
  return [h.join(","), r1.map(csvEscape).join(","), ""].join("\n")
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

export function parseCsvToRecords(csvText: string): {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
} {
  const errors: string[] = []
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    errors.push("CSV must include a header row and at least one data row.")
    return { headers: [], rows: [], errors }
  }
  const headers = parseCsvLine(lines[0]!).map((h) => h.replace(/\s+/g, " ").trim())
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase()
  const normHeaders = headers.map(norm)
  const ocIdx = normHeaders.indexOf("OBJECT_CODE")
  const obisIdx = normHeaders.indexOf("OBIS")
  if (ocIdx < 0 && obisIdx < 0) {
    errors.push('CSV must include "OBJECT_CODE" and/or "OBIS" in the header row.')
    return { headers, rows: [], errors }
  }

  const rows: Record<string, string>[] = []
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]!)
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]!
      if (!key) continue
      row[key] = (cells[i] ?? "").trim()
    }
    const object_code = (row.OBJECT_CODE ?? row.object_code ?? "").trim()
    const obis = (row.OBIS ?? row.obis ?? "").trim()
    if (!object_code && !obis) {
      errors.push(`Row ${li + 1}: OBJECT_CODE and OBIS empty (skipped).`)
      continue
    }
    rows.push(row)
  }
  return { headers, rows, errors }
}
