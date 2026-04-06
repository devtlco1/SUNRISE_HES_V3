/**
 * Operator OBIS catalog (seeded + persisted). Runtime reads remain on the Python sidecar.
 * `pack_key` is an open string so operators can add custom categories in OBIS config.
 */

export type ObisPackKey = string

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

/** Default pack keys (order for navigation when present in catalog). */
export const OBIS_PACK_ORDER: ObisPackKey[] = [
  "basic_setting",
  "energy",
  "instantaneous",
  "power",
  "demand",
  "event_logs",
  "load_profile",
]

export const OBIS_PACK_LABELS: Record<string, string> = {
  basic_setting: "Basic setting",
  energy: "Energy",
  instantaneous: "Instantaneous",
  power: "Power",
  demand: "Demand",
  event_logs: "Event Logs",
  load_profile: "Load Profile",
}

export function packLabel(key: string): string {
  return OBIS_PACK_LABELS[key] ?? key
}
