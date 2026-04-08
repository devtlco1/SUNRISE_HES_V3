/**
 * Meter registry CSV (template, export, import) — aligned with add/edit form fields.
 */

import type { MeterListRow } from "@/types/meter"

export const METERS_CSV_HEADERS = [
  "Internal ID",
  "Serial number",
  "Customer / account",
  "Phase",
  "Feeder",
  "Transformer",
  "Zone",
  "Comm status",
  "Last comm",
  "Relay status",
  "Last reading",
  "Alarm state",
  "Manufacturer",
  "Model",
  "Firmware",
  "Meter profile ID",
  "Feeder ID",
  "Transformer ID",
  "Zone ID",
  "Tariff profile ID",
] as const

function csvEscape(cell: string): string {
  const s = cell.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function normKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

/** Match CSV header cell to value (case-insensitive key match). */
function pick(row: Record<string, string>, aliases: string[]): string {
  const entries = Object.entries(row)
  for (const a of aliases) {
    const want = normKey(a)
    for (const [k, val] of entries) {
      if (normKey(k) === want) return val.trim()
    }
  }
  return ""
}

export function csvRecordToMeterFields(
  row: Record<string, string>
): Record<string, unknown> {
  return {
    id: pick(row, [
      "Internal ID",
      "internal_id",
      "Meter ID",
      "internal id",
      "id",
    ]),
    serialNumber: pick(row, [
      "Serial number",
      "serial number",
      "Serial",
      "serialNumber",
    ]),
    customerName: pick(row, [
      "Customer / account",
      "customer / account",
      "Customer",
      "customerName",
    ]),
    phaseType: pick(row, ["Phase", "phase", "phaseType"]),
    feeder: pick(row, ["Feeder", "feeder"]),
    transformer: pick(row, ["Transformer", "transformer"]),
    zone: pick(row, ["Zone", "zone"]),
    commStatus: pick(row, ["Comm status", "comm status", "commStatus", "Communication state"]),
    lastCommunicationAt: pick(row, [
      "Last comm",
      "last comm",
      "lastCommunicationAt",
    ]),
    relayStatus: pick(row, ["Relay status", "relay status", "relayStatus", "Relay state"]),
    lastReadingAt: pick(row, ["Last reading", "last reading", "lastReadingAt"]),
    alarmState: pick(row, ["Alarm state", "alarm state", "alarmState", "Alarm"]),
    manufacturer: pick(row, ["Manufacturer", "manufacturer"]),
    model: pick(row, ["Model", "model"]),
    firmwareVersion: pick(row, ["Firmware", "firmware", "firmwareVersion"]),
    meterProfileId: pick(row, ["Meter profile ID", "meter profile id", "meterProfileId"]),
    feederId: pick(row, ["Feeder ID", "feeder id", "feederId"]),
    transformerId: pick(row, ["Transformer ID", "transformer id", "transformerId"]),
    zoneId: pick(row, ["Zone ID", "zone id", "zoneId"]),
    tariffProfileId: pick(row, ["Tariff profile ID", "tariff profile id", "tariffProfileId"]),
  }
}

export function meterRowToCsvLine(row: MeterListRow): string {
  const cells = [
    row.id,
    row.serialNumber,
    row.customerName,
    row.phaseType,
    row.feeder,
    row.transformer,
    row.zone,
    row.commStatus,
    row.lastCommunicationAt,
    row.relayStatus,
    row.lastReadingAt,
    row.alarmState,
    row.manufacturer,
    row.model,
    row.firmwareVersion,
    row.meterProfileId,
    row.feederId,
    row.transformerId,
    row.zoneId,
    row.tariffProfileId,
  ]
  return cells.map((c) => csvEscape(String(c))).join(",")
}

export function metersToCsv(rows: MeterListRow[]): string {
  const lines = [[...METERS_CSV_HEADERS].map(csvEscape).join(",")]
  for (const r of rows) {
    lines.push(meterRowToCsvLine(r))
  }
  return `${lines.join("\r\n")}\r\n`
}

export function metersTemplateCsv(): string {
  const h = [...METERS_CSV_HEADERS]
  const ex1 = [
    "hes-mt-example-1",
    "SN-000001",
    "Example customer",
    "single",
    "FDR-01",
    "TX-100",
    "Zone A",
    "online",
    "2026-04-08 10:00",
    "energized",
    "2026-04-08 09:55",
    "none",
    "ExampleMfr",
    "EX-100",
    "1.0.0",
    "",
    "",
    "",
    "",
    "",
  ]
  const ex2 = [
    "",
    "SN-000002",
    "Second site",
    "three_wye",
    "FDR-02",
    "TX-200",
    "Zone B",
    "offline",
    "2026-04-07 18:00",
    "unknown",
    "2026-04-07 17:00",
    "warning",
    "OtherCo",
    "OC-9",
    "2.1.0",
    "",
    "",
    "",
    "",
    "",
  ]
  return [
    h.map(csvEscape).join(","),
    ex1.map(csvEscape).join(","),
    ex2.map(csvEscape).join(","),
    "",
  ].join("\r\n")
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

export function parseMetersCsvText(csvText: string): {
  rows: Record<string, string>[]
  errors: string[]
} {
  const errors: string[] = []
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    errors.push("CSV must include a header row and at least one data row.")
    return { rows: [], errors }
  }
  const headers = parseCsvLine(lines[0]!).map((h) => h.replace(/\s+/g, " ").trim())
  const rows: Record<string, string>[] = []
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]!)
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]!
      if (!key) continue
      row[key] = (cells[i] ?? "").trim()
    }
    const serial = pick(row, ["Serial number", "serial number", "Serial", "serialNumber"])
    if (!serial) {
      errors.push(`Row ${li + 1}: Serial number is empty (skipped).`)
      continue
    }
    rows.push(row)
  }
  return { rows, errors }
}
