/**
 * Operator OBIS catalog (seeded + persisted). Runtime reads remain on the Python sidecar.
 * `pack_key` is an open string so operators can add custom categories in OBIS config.
 */

export type ObisPackKey = string

/** Top-level OBIS config / readings tab: Basic, Energy, Profile. */
export type ObisFamilyTab = "basic" | "energy" | "profile"

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
  /** Stable subsection key (groups rows; often matches a known section slug). */
  pack_key: ObisPackKey
  /** Operator tab: basic | energy | profile */
  family_tab: ObisFamilyTab
  /** Spreadsheet / human section (e.g. BASIC SETTING, HISTORY ENERGY). */
  section_group: string
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
