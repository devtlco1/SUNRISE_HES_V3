import { normalizeObisCatalogEntry } from "@/lib/obis/normalize-catalog"
import type { ObisCatalogEntry } from "@/lib/obis/types"

export type CatalogImportSummary = {
  inserted: number
  updated: number
  disabled: number
  rejected: number
  validationErrors: Array<{ index: number; obis?: string; message: string }>
}

export type CatalogImportResult = {
  rows: ObisCatalogEntry[]
  summary: CatalogImportSummary
}

/** Map camelCase template / spreadsheet-friendly keys to `normalizeObisCatalogEntry` shape. */
export function importRowRecordToCatalogInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const r = raw as Record<string, unknown>
  return {
    obis: r.obis,
    description: r.description,
    object_type: r.object_type ?? r.objectType,
    class_id: r.class_id ?? r.classId,
    attribute: r.attribute,
    scaler_unit_attribute: r.scaler_unit_attribute ?? r.scalerUnitAttribute,
    unit: r.unit,
    result_format: r.result_format ?? r.resultFormat,
    status: r.status,
    pack_key: r.pack_key ?? r.packKey,
    enabled: r.enabled,
    sort_order: r.sort_order ?? r.sortOrder,
    notes: r.notes,
  }
}

/** Downloadable template uses camelCase; import accepts camelCase or snake_case. */
export function obisCatalogTemplateDownloadRows(): Record<string, unknown>[] {
  return [
    {
      obis: "1.0.32.7.0.255",
      description: "Example: L1 voltage",
      objectType: "Register",
      classId: 3,
      attribute: 2,
      scalerUnitAttribute: 3,
      unit: "V",
      resultFormat: "scalar",
      status: "catalog_only",
      packKey: "instantaneous",
      enabled: true,
      sortOrder: 10,
      notes: "",
    },
  ]
}

/** Merge validated import rows into `existing` by OBIS key (upsert). */
export function upsertCatalogImport(
  existing: ObisCatalogEntry[],
  importArray: unknown
): CatalogImportResult {
  const summary: CatalogImportSummary = {
    inserted: 0,
    updated: 0,
    disabled: 0,
    rejected: 0,
    validationErrors: [],
  }

  if (!Array.isArray(importArray)) {
    summary.rejected += 1
    summary.validationErrors.push({ index: -1, message: "Expected a JSON array of catalog rows." })
    return { rows: existing, summary }
  }

  const seenInFile = new Set<string>()
  const toMerge: ObisCatalogEntry[] = []

  for (let i = 0; i < importArray.length; i++) {
    const coerced = importRowRecordToCatalogInput(importArray[i])
    const row = normalizeObisCatalogEntry(coerced)
    if (!row) {
      summary.rejected += 1
      summary.validationErrors.push({
        index: i,
        message: "Invalid row (missing OBIS, unknown status, or unusable fields).",
      })
      continue
    }
    if (seenInFile.has(row.obis)) {
      summary.rejected += 1
      summary.validationErrors.push({
        index: i,
        obis: row.obis,
        message: "Duplicate OBIS in import (first row wins).",
      })
      continue
    }
    seenInFile.add(row.obis)
    if (row.enabled === false) summary.disabled += 1
    toMerge.push(row)
  }

  const map = new Map(existing.map((r) => [r.obis, r]))
  for (const row of toMerge) {
    if (map.has(row.obis)) summary.updated += 1
    else summary.inserted += 1
    map.set(row.obis, row)
  }

  const rows = [...map.values()].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.obis.localeCompare(b.obis)
  })

  return { rows, summary }
}
