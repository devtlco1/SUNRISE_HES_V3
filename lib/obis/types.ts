/**
 * Operator OBIS catalog persisted in `data/obis-catalog.json`.
 * Classification is vendor PRM_CODE_OBJECT (ClassName / SubClassName / SortNo) joined to PRM_CODE_OBIS.
 */

export type ObisFamilyTab = "basic" | "energy" | "profile"

export type ObisPackKey =
  | "basic_setting"
  | "instantaneous"
  | "power"
  | "demand"
  | "energy"
  | "event_logs"
  | "load_profile"
  | `${ObisFamilyTab}_${string}`

export function packLabel(pack_key: string): string {
  return pack_key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export interface ObisCatalogEntry {
  /** PRM_CODE_OBIS.ObjectCode / PRM_CODE_OBJECT.Code (may include 7th attribute segment). */
  object_code: string
  /** Six-group COSEM logical name derived from `object_code`. */
  obis: string
  /** Operator-facing label (typically PRM `Name`). */
  description: string
  object_name: string
  class_name: string
  subclass_name: string
  sort_no: number
  protocol: string
  obis_hex: string
  data_type: string
  analytic_type: string
  unit: string
  scaler: number
  read_batch_status: string
  read_single_status: string
  collect_plan_status: string
  collect_plan_type_status: string
  setting_status: string
  display_status: string
  xslt: string
  phase: string
  device_type: string
  object_status: string
  cim_code: string
  crt_on: string
  mdf_on: string
  /** COSEM read shape for Python read-obis-selection (inferred from PRM + OBIS). */
  object_type: string
  class_id: number
  attribute: number
  scaler_unit_attribute: number
  result_format: string
  status: "active" | "catalog_only"
  enabled: boolean
  /** Display order within class/subclass (from SortNo). */
  sort_order: number
  notes?: string
}
