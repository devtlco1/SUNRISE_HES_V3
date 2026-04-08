/**
 * CSV export for readings table snapshots (operator / Excel friendly).
 */

import type { ObisRowReadState } from "@/lib/obis/merge-read-results"
import type { ObisCatalogEntry } from "@/lib/obis/types"

function escapeCsvField(value: string): string {
  const s = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function readStatusLabel(status: ObisRowReadState["status"]): string {
  switch (status) {
    case "ok":
      return "ok"
    case "error":
      return "error"
    case "unsupported":
      return "unsupported"
    case "skipped":
      return "skipped"
    case "pending":
      return "pending"
    case "running":
      return "running"
    case "not_attempted":
      return "not_attempted"
    case "cancelled":
      return "cancelled"
    default:
      return String(status)
  }
}

export type ReadingsCsvRowInput = {
  catalog: ObisCatalogEntry
  rowState: ObisRowReadState | undefined
}

export function buildReadingsResultsCsv(params: {
  meterSerial: string
  familyTabLabel: string
  sectionLabel: string
  rows: ReadingsCsvRowInput[]
}): string {
  const header = [
    "Meter serial",
    "Family tab",
    "Section",
    "OBIS",
    "Description",
    "Attribute",
    "Unit",
    "Value",
    "Read status",
    "Error",
    "Timestamp (UTC)",
  ]
  const lines = [header.map(escapeCsvField).join(",")]
  for (const { catalog: r, rowState: rs } of params.rows) {
    const attribute = String(r.attribute ?? "")
    const unit = r.unit ?? ""
    const value = rs?.result ?? ""
    const status = rs ? readStatusLabel(rs.status) : "not_attempted"
    const err = rs?.error ?? ""
    const ts = rs?.lastReadAt ?? ""
    lines.push(
      [
        params.meterSerial,
        params.familyTabLabel,
        params.sectionLabel,
        r.obis,
        r.description,
        attribute,
        unit,
        value,
        status,
        err,
        ts,
      ]
        .map((c) => escapeCsvField(String(c)))
        .join(",")
    )
  }
  return lines.join("\r\n")
}

export function downloadUtf8CsvFile(filename: string, csvBody: string): void {
  const blob = new Blob([`\uFEFF${csvBody}`], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function sanitizeCsvFilenamePart(part: string): string {
  const t = part.trim().replace(/[^\w.\-]+/g, "_").slice(0, 80)
  return t || "meter"
}
