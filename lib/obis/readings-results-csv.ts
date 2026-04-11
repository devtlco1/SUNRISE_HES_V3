/**
 * Parse operator readings export CSV (meter reads) to derive which `object_code`
 * values are supported (`Read status === ok`) vs not.
 */

export type ReadingsCsvRow = {
  objectCodeRaw: string
  attribute: string
  readStatus: string
}

/** RFC-style CSV row split (handles quoted fields). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ",") {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

/**
 * Canonical catalog `object_code`: 7 segments `a.b.c.d.e.f.attr` when attribute
 * is separate in CSV (6-group logical name in Object code column).
 */
export function canonicalObjectCodeFromReadingsRow(
  objectCodeColumn: string,
  attributeColumn: string
): string {
  const oc = objectCodeColumn.trim()
  const attr = attributeColumn.trim()
  const parts = oc.split(".").filter((p) => p !== "")
  if (parts.length >= 7) return oc
  if (parts.length === 6 && /^\d+$/.test(attr)) {
    return `${oc}.${attr}`
  }
  return oc
}

export function parseReadingsExportCsv(text: string): ReadingsCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0]!)
  const idxObject = header.findIndex((h) => h.trim().toLowerCase() === "object code")
  const idxAttr = header.findIndex((h) => h.trim().toLowerCase() === "attribute")
  const idxStatus = header.findIndex((h) => h.trim().toLowerCase() === "read status")
  if (idxObject < 0 || idxAttr < 0 || idxStatus < 0) {
    throw new Error("readings CSV: missing Object code, Attribute, or Read status column")
  }
  const out: ReadingsCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!)
    if (cells.length <= Math.max(idxObject, idxAttr, idxStatus)) continue
    out.push({
      objectCodeRaw: cells[idxObject] ?? "",
      attribute: cells[idxAttr] ?? "",
      readStatus: (cells[idxStatus] ?? "").trim().toLowerCase(),
    })
  }
  return out
}

/**
 * Object codes that have at least one `ok` row (wins over error/unsupported on same code).
 */
export function supportedObjectCodesOk(rows: ReadingsCsvRow[]): Set<string> {
  const byCode = new Map<string, { ok: boolean }>()
  for (const r of rows) {
    const code = canonicalObjectCodeFromReadingsRow(r.objectCodeRaw, r.attribute)
    if (!code) continue
    const st = r.readStatus
    const prev = byCode.get(code) ?? { ok: false }
    if (st === "ok") prev.ok = true
    byCode.set(code, prev)
  }
  const supported = new Set<string>()
  for (const [code, v] of byCode) {
    if (v.ok) supported.add(code)
  }
  return supported
}

export function summarizeReadingsCsv(rows: ReadingsCsvRow[]): {
  distinctObjectCodes: number
  supportedOk: number
  unsupportedCount: number
} {
  const codes = new Set<string>()
  for (const r of rows) {
    codes.add(canonicalObjectCodeFromReadingsRow(r.objectCodeRaw, r.attribute))
  }
  const supported = supportedObjectCodesOk(rows)
  return {
    distinctObjectCodes: codes.size,
    supportedOk: supported.size,
    unsupportedCount: codes.size - supported.size,
  }
}
