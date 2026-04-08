/**
 * CSV export/import helpers for OBIS catalog (operator spreadsheet workflow).
 */

import type { ObisCatalogEntry } from "@/lib/obis/types"

export const OBIS_CATALOG_CSV_HEADERS_MIN = [
  "FAMILY_TAB",
  "SECTION_GROUP",
  "OBIS",
  "DESCRIPTION",
  "ATTRIBUTES",
  "R/W",
  "UNIT",
] as const

export const OBIS_CATALOG_CSV_HEADERS_FULL = [
  ...OBIS_CATALOG_CSV_HEADERS_MIN,
  "OBJECT_TYPE",
  "CLASS_ID",
  "SCALER_UNIT_ATTRIBUTE",
  "RESULT_FORMAT",
  "STATUS",
  "PACK_KEY",
  "ENABLED",
  "SORT_ORDER",
  "NOTES",
] as const

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
  return cell
}

export function catalogRowsToCsv(rows: ObisCatalogEntry[], full = true): string {
  const headers = full
    ? [...OBIS_CATALOG_CSV_HEADERS_FULL]
    : [...OBIS_CATALOG_CSV_HEADERS_MIN]
  const lines = [headers.join(",")]
  for (const r of rows) {
    const base = [
      r.family_tab,
      r.section_group,
      r.obis,
      r.description,
      String(r.attribute),
      "",
      r.unit,
    ]
    if (!full) {
      lines.push(base.map(csvEscape).join(","))
      continue
    }
    const rest = [
      r.object_type,
      String(r.class_id),
      String(r.scaler_unit_attribute),
      r.result_format,
      r.status,
      r.pack_key,
      r.enabled ? "true" : "false",
      String(r.sort_order),
      r.notes ?? "",
    ]
    lines.push([...base, ...rest].map(csvEscape).join(","))
  }
  return `${lines.join("\n")}\n`
}

/** Operator template: two example rows, full columns. */
export function obisCatalogCsvTemplate(): string {
  const h = [...OBIS_CATALOG_CSV_HEADERS_FULL]
  const r1 = [
    "basic",
    "BASIC SETTING",
    "0.0.1.0.0.255",
    "Date and time (clock)",
    "2",
    "RW",
    "local",
    "Clock",
    "1",
    "3",
    "scalar",
    "catalog_only",
    "basic_setting",
    "true",
    "1",
    "",
  ]
  const r2 = [
    "energy",
    "ENERGY REGISTER",
    "1.0.1.8.0.255",
    "Active energy import (+A)",
    "2",
    "R",
    "kWh",
    "Register",
    "3",
    "3",
    "scalar",
    "active",
    "energy",
    "true",
    "10",
    "",
  ]
  return [
    h.join(","),
    r1.map(csvEscape).join(","),
    r2.map(csvEscape).join(","),
    "",
  ].join("\n")
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
  const obisIdx = normHeaders.indexOf("OBIS")
  if (obisIdx < 0) {
    errors.push('Required column "OBIS" is missing in the header row.')
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
    const obis = (row.OBIS ?? row.obis ?? "").trim()
    if (!obis) {
      errors.push(`Row ${li + 1}: OBIS is empty (skipped).`)
      continue
    }
    rows.push(row)
  }
  return { headers, rows, errors }
}
