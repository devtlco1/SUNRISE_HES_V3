/**
 * Operator OBIS catalog (seeded metadata). Runtime reads remain on the Python sidecar.
 */

export type ObisPackKey =
  | "basic_setting"
  | "energy"
  | "instantaneous"
  | "power"
  | "demand"
  | "event_logs"
  | "load_profile"

export interface ObisCatalogEntry {
  obis: string
  description: string
  object_type: string
  class_id: number
  attribute: number
  scaler_unit_attribute: number
  unit: string
  result_format: string
  status: "active" | "catalog_only"
  pack_key: ObisPackKey
  enabled: boolean
  sort_order: number
  notes?: string
}

export const OBIS_PACK_LABELS: Record<ObisPackKey, string> = {
  basic_setting: "Basic setting",
  energy: "Energy",
  instantaneous: "Instantaneous",
  power: "Power",
  demand: "Demand",
  event_logs: "Event Logs",
  load_profile: "Load Profile",
}

export const OBIS_PACK_ORDER: ObisPackKey[] = [
  "basic_setting",
  "energy",
  "instantaneous",
  "power",
  "demand",
  "event_logs",
  "load_profile",
]
