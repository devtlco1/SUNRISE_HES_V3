import type { FeederRow, TransformerRow, ZoneRow } from "@/types/configuration"

function csvEscape(cell: string): string {
  const s = cell.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export const FEEDER_CSV_HEADERS = ["ID", "Code", "Name", "Notes"] as const
export const TRANSFORMER_CSV_HEADERS = [
  "ID",
  "Code",
  "Name",
  "Feeder ID",
  "Notes",
] as const
export const ZONE_CSV_HEADERS = ["ID", "Code", "Name", "Feeder ID", "Notes"] as const

export function feedersToCsv(rows: FeederRow[]): string {
  const lines = [[...FEEDER_CSV_HEADERS].map(csvEscape).join(",")]
  for (const r of rows) {
    lines.push([r.id, r.code, r.name, r.notes].map((c) => csvEscape(String(c))).join(","))
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function transformersToCsv(rows: TransformerRow[]): string {
  const lines = [[...TRANSFORMER_CSV_HEADERS].map(csvEscape).join(",")]
  for (const r of rows) {
    lines.push(
      [r.id, r.code, r.name, r.feederId, r.notes].map((c) => csvEscape(String(c))).join(",")
    )
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function zonesToCsv(rows: ZoneRow[]): string {
  const lines = [[...ZONE_CSV_HEADERS].map(csvEscape).join(",")]
  for (const r of rows) {
    lines.push(
      [r.id, r.code, r.name, r.feederId, r.notes].map((c) => csvEscape(String(c))).join(",")
    )
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function feedersTemplateCsv(): string {
  const h = [...FEEDER_CSV_HEADERS]
  const ex = ["", "FDR-01", "North main", ""]
  return `\uFEFF${[h.map(csvEscape).join(","), ex.map(csvEscape).join(","), ""].join("\r\n")}`
}

export function transformersTemplateCsv(): string {
  const h = [...TRANSFORMER_CSV_HEADERS]
  const ex = ["", "TX-100", "Sub A", "cfg-gf-FDR-01", ""]
  return `\uFEFF${[h.map(csvEscape).join(","), ex.map(csvEscape).join(","), ""].join("\r\n")}`
}

export function zonesTemplateCsv(): string {
  const h = [...ZONE_CSV_HEADERS]
  const ex = ["", "Z-N4", "North zone 4", "cfg-gf-FDR-01", ""]
  return `\uFEFF${[h.map(csvEscape).join(","), ex.map(csvEscape).join(","), ""].join("\r\n")}`
}
