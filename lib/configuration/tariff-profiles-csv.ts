import type { TariffProfileRow } from "@/types/configuration"

function csvEscape(cell: string): string {
  const s = cell.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export const TARIFF_PROFILES_CSV_HEADERS = [
  "ID",
  "Name",
  "Code",
  "Description",
  "Active",
  "Notes",
] as const

export function tariffProfilesToCsv(rows: TariffProfileRow[]): string {
  const lines = [[...TARIFF_PROFILES_CSV_HEADERS].map(csvEscape).join(",")]
  for (const r of rows) {
    lines.push(
      [r.id, r.name, r.code, r.description, r.active ? "true" : "false", r.notes]
        .map((c) => csvEscape(String(c)))
        .join(",")
    )
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function tariffProfilesTemplateCsv(): string {
  const h = [...TARIFF_PROFILES_CSV_HEADERS]
  const ex = ["", "Residential flat", "RES-FLAT", "Flat rate", "true", ""]
  return `\uFEFF${[h.map(csvEscape).join(","), ex.map(csvEscape).join(","), ""].join("\r\n")}`
}
