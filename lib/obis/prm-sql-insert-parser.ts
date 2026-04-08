/**
 * Minimal SQL Server INSERT … VALUES tuple parser for PRM_CODE_* dumps (N'…' strings, CAST, nested parens).
 */

/** Parse top-level ( … ) starting at index of `(`. Returns exclusive end index after closing `)`. */
export function parseTopLevelParenTuple(
  s: string,
  openParenIdx: number
): { end: number; inner: string } {
  let i = openParenIdx
  if (s[i] !== "(") throw new Error("expected '('")
  let depth = 0
  const start = i
  while (i < s.length) {
    const c = s[i]!
    if (c === "N" && s[i + 1] === "'") {
      i += 2
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          i += 2
          continue
        }
        if (s[i] === "'") {
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === "'") {
      i++
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          i += 2
          continue
        }
        if (s[i] === "'") {
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === "(") depth++
    else if (c === ")") {
      depth--
      if (depth === 0) {
        return { end: i + 1, inner: s.slice(start + 1, i) }
      }
    }
    i++
  }
  throw new Error("unclosed tuple")
}

export function splitSqlFields(inner: string): string[] {
  const fields: string[] = []
  let cur = ""
  let depth = 0
  let i = 0
  while (i < inner.length) {
    const c = inner[i]!
    if (c === "N" && inner[i + 1] === "'") {
      cur += "N'"
      i += 2
      while (i < inner.length) {
        if (inner[i] === "'" && inner[i + 1] === "'") {
          cur += "''"
          i += 2
          continue
        }
        if (inner[i] === "'") {
          cur += "'"
          i++
          break
        }
        cur += inner[i]!
        i++
      }
      continue
    }
    if (c === "'") {
      cur += "'"
      i++
      while (i < inner.length) {
        if (inner[i] === "'" && inner[i + 1] === "'") {
          cur += "''"
          i += 2
          continue
        }
        if (inner[i] === "'") {
          cur += "'"
          i++
          break
        }
        cur += inner[i]!
        i++
      }
      continue
    }
    if (c === "(") {
      depth++
      cur += c
      i++
      continue
    }
    if (c === ")") {
      depth--
      cur += c
      i++
      continue
    }
    if (c === "," && depth === 0) {
      fields.push(cur.trim())
      cur = ""
      i++
      continue
    }
    cur += c
    i++
  }
  if (cur.trim()) fields.push(cur.trim())
  return fields
}

export function decodeNString(field: string): string {
  const t = field.trim()
  if (t === "NULL") return ""
  if (t.startsWith("N'")) {
    let j = 2
    let out = ""
    while (j < t.length) {
      if (t[j] === "'" && t[j + 1] === "'") {
        out += "'"
        j += 2
        continue
      }
      if (t[j] === "'") break
      out += t[j]!
      j++
    }
    return out
  }
  return t
}

export function castIntField(field: string): number {
  const t = field.trim()
  if (t === "NULL") return 0
  const m = t.match(/^CAST\s*\(\s*(-?\d+)\s+AS/i)
  if (m) return Number(m[1])
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

export function extractValuesFields(insertStmt: string): string[] | null {
  const vi = insertStmt.search(/\bVALUES\s*\(/i)
  if (vi < 0) return null
  const open = insertStmt.indexOf("(", vi + 6)
  if (open < 0) return null
  const { inner } = parseTopLevelParenTuple(insertStmt, open)
  return splitSqlFields(inner)
}
