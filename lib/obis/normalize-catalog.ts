import { INVALID_OBIS_SHAPE_NOTE, isValidCosemObisLogicalName } from "@/lib/obis/obis-logical-name"
import { inferDlmsFromPrm } from "@/lib/obis/infer-dlms-from-prm"
import { splitVendorObjectCode } from "@/lib/obis/split-vendor-object-code"
import type { ObisCatalogEntry } from "@/lib/obis/types"

const STATUS = new Set(["active", "catalog_only"])

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

/** Normalize one catalog row (vendor PRM join shape). */
export function normalizeObisCatalogEntry(raw: unknown): ObisCatalogEntry | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>

  let object_code = str(r.object_code).trim()
  if (!object_code) object_code = str(r.objectCode).trim()
  const split = object_code ? splitVendorObjectCode(object_code) : { obis: "", attribute: 2 }
  let obis = str(r.obis).trim() || split.obis
  if (!object_code && obis) {
    object_code = obis
  }
  if (!object_code) return null
  if (!str(r.obis).trim() && split.obis) obis = split.obis

  const object_name = str(r.object_name ?? r.objectName).trim() || str(r.description).trim() || object_code
  const description = str(r.description).trim() || object_name
  const class_name = str(r.class_name ?? r.className).trim() || "Unmapped"
  const subclass_name = str(r.subclass_name ?? r.subclassName).trim()
  const sort_no = Math.max(0, Math.floor(num(r.sort_no ?? r.sortNo, num(r.sort_order, 0))))

  const status = str(r.status, "catalog_only")
  if (!STATUS.has(status)) return null

  const obisShapeOk = isValidCosemObisLogicalName(obis)
  const priorNotes = r.notes !== undefined ? str(r.notes).trim() : ""

  const data_type = str(r.data_type ?? r.dataType)
  const analytic_type = str(r.analytic_type ?? r.analyticType)
  let object_type = str(r.object_type ?? r.objectType, "data").trim() || "data"
  let class_id = num(r.class_id ?? r.classId, 1)
  const attribute =
    r.attribute !== undefined && r.attribute !== null && String(r.attribute) !== ""
      ? num(r.attribute, split.attribute)
      : split.attribute
  if (!r.object_type && !r.objectType && !r.class_id && !r.classId) {
    const inf = inferDlmsFromPrm({
      obisLogical: obis,
      dataType: data_type,
      analyticType: analytic_type,
    })
    object_type = inf.object_type
    class_id = inf.class_id
  }

  return {
    object_code,
    obis,
    description,
    object_name,
    class_name,
    subclass_name,
    sort_no,
    protocol: str(r.protocol, "2"),
    obis_hex: str(r.obis_hex ?? r.obisHex),
    data_type,
    analytic_type,
    unit: str(r.unit),
    scaler: num(r.scaler, 0),
    read_batch_status: str(r.read_batch_status ?? r.readBatchStatus),
    read_single_status: str(r.read_single_status ?? r.readSingleStatus),
    collect_plan_status: str(r.collect_plan_status ?? r.collectPlanStatus),
    collect_plan_type_status: str(r.collect_plan_type_status ?? r.collectPlanTypeStatus),
    setting_status: str(r.setting_status ?? r.settingStatus),
    display_status: str(r.display_status ?? r.displayStatus),
    xslt: str(r.xslt),
    phase: str(r.phase),
    device_type: str(r.device_type ?? r.deviceType),
    object_status: str(r.object_status ?? r.objectStatus),
    cim_code: str(r.cim_code ?? r.cimCode),
    crt_on: str(r.crt_on ?? r.crtOn),
    mdf_on: str(r.mdf_on ?? r.mdfOn),
    object_type,
    class_id,
    attribute,
    scaler_unit_attribute: num(r.scaler_unit_attribute ?? r.scalerUnitAttribute, 3),
    result_format: str(r.result_format, "scalar") || "scalar",
    status: status as ObisCatalogEntry["status"],
    enabled: obisShapeOk ? (r.enabled === false ? false : true) : false,
    sort_order: sort_no,
    notes: obisShapeOk
      ? priorNotes || undefined
      : [priorNotes, INVALID_OBIS_SHAPE_NOTE].filter(Boolean).join(" · "),
  }
}

export function normalizeObisCatalogRows(input: unknown): ObisCatalogEntry[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: ObisCatalogEntry[] = []
  for (const item of input) {
    const row = normalizeObisCatalogEntry(item)
    if (!row || seen.has(row.object_code)) continue
    seen.add(row.object_code)
    out.push(row)
  }
  return out
}
