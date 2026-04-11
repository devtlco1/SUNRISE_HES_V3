/**
 * Parse operator "read results" CSV (same columns as `lib/readings/csv-export.ts`).
 */

export type ReadResultsCsvRow = {
  objectCode: string
  readStatus: string
}

function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1)
  return s
}

/** Split one CSV line respecting double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        q = !q
      }
      continue
    }
    if (!q && c === ",") {
      out.push(cur)
      cur = ""
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function normHeader(h: string): string {
  return h.replace(/\s*\(UTC\)\s*$/i, "").trim().toLowerCase()
}

function findCol(headers: string[], ...candidates: string[]): number {
  const norm = headers.map(normHeader)
  for (const c of candidates) {
    const want = c.toLowerCase()
    const i = norm.indexOf(want)
    if (i >= 0) return i
  }
  return -1
}

export type ParseReadResultsCsvResult =
  | { ok: true; rows: ReadResultsCsvRow[] }
  | { ok: false; error: string }

/**
 * Parse CSV text; requires header row with Object code + Read status columns.
 */
export function parseReadResultsCsv(text: string): ParseReadResultsCsvResult {
  const raw = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = raw.split("\n").filter((l) => l.trim() !== "")
  if (lines.length < 2) {
    return { ok: false, error: "CSV must include a header row and at least one data row." }
  }
  const headers = splitCsvLine(lines[0]!)
  const iOc = findCol(headers, "object code", "object_code")
  const iSt = findCol(headers, "read status", "read_status")
  if (iOc < 0) {
    return { ok: false, error: 'Missing "Object code" column in header.' }
  }
  if (iSt < 0) {
    return { ok: false, error: 'Missing "Read status" column in header.' }
  }

  const rows: ReadResultsCsvRow[] = []
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]!)
    const objectCode = (cells[iOc] ?? "").trim()
    const readStatus = (cells[iSt] ?? "").trim().toLowerCase()
    if (!objectCode) continue
    rows.push({ objectCode, readStatus })
  }
  if (rows.length === 0) {
    return { ok: false, error: "No data rows with a non-empty object code." }
  }
  return { ok: true, rows }
}

export type ObjectCodeSupportMap = Map<
  string,
  { hasOk: boolean; canonicalObjectCode: string }
>

/**
 * Build lowercase-keyed map: `hasOk` true iff any row for that code has status `ok`.
 * `canonicalObjectCode` is the last seen casing for that key (prefer last `ok` row).
 */
export function buildObjectCodeSupportFromRows(
  rows: ReadResultsCsvRow[]
): ObjectCodeSupportMap {
  const m = new Map<string, { hasOk: boolean; canonicalObjectCode: string }>()
  for (const { objectCode, readStatus } of rows) {
    const key = objectCode.toLowerCase()
    const prev = m.get(key) ?? { hasOk: false, canonicalObjectCode: "" }
    if (readStatus === "ok") {
      prev.hasOk = true
      prev.canonicalObjectCode = objectCode
    } else if (!prev.canonicalObjectCode) {
      prev.canonicalObjectCode = objectCode
    }
    m.set(key, prev)
  }
  return m
}
