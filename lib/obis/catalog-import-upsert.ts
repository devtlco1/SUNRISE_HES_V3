import { subclassKey } from "@/lib/obis/catalog-vendor-group"
import { normalizeObisCatalogEntry } from "@/lib/obis/normalize-catalog"
import type { ObisCatalogEntry } from "@/lib/obis/types"

export type CatalogImportSummary = {
  inserted: number
  updated: number
  disabled: number
  rejected: number
  validationErrors: Array<{ index: number; object_code?: string; message: string }>
}

export type CatalogImportResult = {
  rows: ObisCatalogEntry[]
  summary: CatalogImportSummary
}

/** Map camelCase / spreadsheet keys to `normalizeObisCatalogEntry` shape. */
export function importRowRecordToCatalogInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const r = raw as Record<string, unknown>
  return {
    object_code: r.object_code ?? r.objectCode,
    obis: r.obis,
    description: r.description,
    object_name: r.object_name ?? r.objectName,
    class_name: r.class_name ?? r.className,
    subclass_name: r.subclass_name ?? r.subClassName ?? r.subclassName,
    sort_no: r.sort_no ?? r.sortNo,
    protocol: r.protocol,
    obis_hex: r.obis_hex ?? r.obisHex,
    data_type: r.data_type ?? r.dataType,
    analytic_type: r.analytic_type ?? r.analyticType,
    unit: r.unit,
    scaler: r.scaler,
    read_batch_status: r.read_batch_status ?? r.readBatchStatus,
    read_single_status: r.read_single_status ?? r.readSingleStatus,
    collect_plan_status: r.collect_plan_status ?? r.collectPlanStatus,
    collect_plan_type_status: r.collect_plan_type_status ?? r.collectPlanTypeStatus,
    setting_status: r.setting_status ?? r.settingStatus,
    display_status: r.display_status ?? r.displayStatus,
    xslt: r.xslt,
    phase: r.phase,
    device_type: r.device_type ?? r.deviceType,
    object_status: r.object_status ?? r.objectStatus,
    cim_code: r.cim_code ?? r.cimCode,
    crt_on: r.crt_on ?? r.crtOn,
    mdf_on: r.mdf_on ?? r.mdfOn,
    object_type: r.object_type ?? r.objectType,
    class_id: r.class_id ?? r.classId,
    attribute: r.attribute,
    scaler_unit_attribute: r.scaler_unit_attribute ?? r.scalerUnitAttribute,
    result_format: r.result_format ?? r.resultFormat,
    status: r.status,
    enabled: r.enabled,
    sort_order: r.sort_order ?? r.sortOrder,
    notes: r.notes,
  }
}

function sortCatalogRows(a: ObisCatalogEntry, b: ObisCatalogEntry): number {
  const c = a.class_name.localeCompare(b.class_name)
  if (c !== 0) return c
  const sk = subclassKey(a).localeCompare(subclassKey(b))
  if (sk !== 0) return sk
  if (a.sort_no !== b.sort_no) return a.sort_no - b.sort_no
  return a.object_code.localeCompare(b.object_code)
}

/** Merge validated import rows into `existing` by object_code (upsert). */
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
        message: "Invalid row (missing object_code / OBIS, unknown status, or unusable fields).",
      })
      continue
    }
    const key = row.object_code
    if (seenInFile.has(key)) {
      summary.rejected += 1
      summary.validationErrors.push({
        index: i,
        object_code: key,
        message: "Duplicate object_code in import (first row wins).",
      })
      continue
    }
    seenInFile.add(key)
    if (row.enabled === false) summary.disabled += 1
    toMerge.push(row)
  }

  const map = new Map(existing.map((r) => [r.object_code, r]))
  for (const row of toMerge) {
    if (map.has(row.object_code)) summary.updated += 1
    else summary.inserted += 1
    map.set(row.object_code, row)
  }

  const rows = [...map.values()].sort(sortCatalogRows)

  return { rows, summary }
}
