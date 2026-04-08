import type { MeterProfileRow } from "@/types/configuration"

function csvEscape(cell: string): string {
  const s = cell.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export const METER_PROFILES_CSV_HEADERS = [
  "ID",
  "Name",
  "Manufacturer",
  "Model",
  "Firmware",
  "Phase type",
  "Default relay",
  "Default comm",
  "Default tariff profile ID",
  "Active",
  "Notes",
] as const

export function meterProfilesToCsv(rows: MeterProfileRow[]): string {
  const lines = [[...METER_PROFILES_CSV_HEADERS].map(csvEscape).join(",")]
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.name,
        r.manufacturer,
        r.model,
        r.firmware,
        r.phaseType,
        r.defaultRelayStatus,
        r.defaultCommStatus,
        r.defaultTariffProfileId,
        r.active ? "true" : "false",
        r.notes,
      ]
        .map((c) => csvEscape(String(c)))
        .join(",")
    )
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export function meterProfilesTemplateCsv(): string {
  const h = [...METER_PROFILES_CSV_HEADERS]
  const ex = [
    "",
    "Standard C&I",
    "Acme",
    "AM-200",
    "2.0.0",
    "three_wye",
    "energized",
    "online",
    "",
    "true",
    "",
  ]
  return `\uFEFF${[h.map(csvEscape).join(","), ex.map(csvEscape).join(","), ""].join("\r\n")}`
}
