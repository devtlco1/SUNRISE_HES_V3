/** Minimal CSV parsing (header row + data rows). */

export function parseCsvLine(line: string): string[] {
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

export function parseCsvKeyed(csvText: string): {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
} {
  const errors: string[] = []
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    errors.push("CSV needs a header and at least one row.")
    return { headers: [], rows: [], errors }
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
    rows.push(row)
  }
  return { headers, rows, errors }
}

function pick(row: Record<string, string>, keys: string[]): string {
  const entries = Object.entries(row)
  for (const a of keys) {
    const want = a.replace(/\s+/g, " ").trim().toLowerCase()
    for (const [k, val] of entries) {
      if (k.replace(/\s+/g, " ").trim().toLowerCase() === want) return val.trim()
    }
  }
  return ""
}

export function rowToMeterProfileFields(row: Record<string, string>): Record<string, unknown> {
  return {
    id: pick(row, ["ID", "id"]),
    name: pick(row, ["Name", "name"]),
    manufacturer: pick(row, ["Manufacturer", "manufacturer"]),
    model: pick(row, ["Model", "model"]),
    firmware: pick(row, ["Firmware", "firmware"]),
    phaseType: pick(row, ["Phase type", "phase type", "phaseType"]),
    defaultRelayStatus: pick(row, ["Default relay", "default relay", "defaultRelayStatus"]),
    defaultCommStatus: pick(row, ["Default comm", "default comm", "defaultCommStatus"]),
    defaultTariffProfileId: pick(row, [
      "Default tariff profile ID",
      "default tariff profile id",
      "defaultTariffProfileId",
    ]),
    active: pick(row, ["Active", "active"]),
    notes: pick(row, ["Notes", "notes"]),
  }
}

export function rowToTariffProfileFields(row: Record<string, string>): Record<string, unknown> {
  return {
    id: pick(row, ["ID", "id"]),
    name: pick(row, ["Name", "name"]),
    code: pick(row, ["Code", "code"]),
    description: pick(row, ["Description", "description"]),
    active: pick(row, ["Active", "active"]),
    notes: pick(row, ["Notes", "notes"]),
  }
}

export function rowToFeederFields(row: Record<string, string>): Record<string, unknown> {
  return {
    id: pick(row, ["ID", "id"]),
    code: pick(row, ["Code", "code"]),
    name: pick(row, ["Name", "name"]),
    notes: pick(row, ["Notes", "notes"]),
  }
}

export function rowToTransformerFields(row: Record<string, string>): Record<string, unknown> {
  return {
    id: pick(row, ["ID", "id"]),
    code: pick(row, ["Code", "code"]),
    name: pick(row, ["Name", "name"]),
    feederId: pick(row, ["Feeder ID", "feeder id", "feederId"]),
    notes: pick(row, ["Notes", "notes"]),
  }
}

export function rowToZoneFields(row: Record<string, string>): Record<string, unknown> {
  return {
    id: pick(row, ["ID", "id"]),
    code: pick(row, ["Code", "code"]),
    name: pick(row, ["Name", "name"]),
    feederId: pick(row, ["Feeder ID", "feeder id", "feederId"]),
    notes: pick(row, ["Notes", "notes"]),
  }
}
