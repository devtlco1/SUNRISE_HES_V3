/**
 * Canonical seeded OBIS catalog for operator UI (/obis-config, /readings).
 * Device-specific tuning stays in MVP-AMI / sidecar config for on-wire reads.
 */

import { inferFamilySectionFromLegacyPack } from "@/lib/obis/family-section"

import type { ObisCatalogEntry, ObisFamilyTab, ObisPackKey } from "./types"
import { OBIS_PACK_ORDER, packLabel } from "./types"

export { OBIS_PACK_LABELS, OBIS_PACK_ORDER, packLabel } from "./types"

function e(
  pack_key: ObisPackKey,
  sort_order: number,
  obis: string,
  description: string,
  fields: Partial<
    Pick<
      ObisCatalogEntry,
      | "object_type"
      | "class_id"
      | "attribute"
      | "scaler_unit_attribute"
      | "unit"
      | "result_format"
      | "status"
      | "enabled"
      | "notes"
      | "family_tab"
      | "section_group"
    >
  > = {}
): ObisCatalogEntry {
  const inf = inferFamilySectionFromLegacyPack(pack_key)
  return {
    obis,
    description,
    object_type: fields.object_type ?? "Register",
    class_id: fields.class_id ?? 3,
    attribute: fields.attribute ?? 2,
    scaler_unit_attribute: fields.scaler_unit_attribute ?? 3,
    unit: fields.unit ?? "",
    result_format: fields.result_format ?? "scalar",
    status: fields.status ?? "catalog_only",
    pack_key,
    family_tab: fields.family_tab ?? inf.family_tab,
    section_group: fields.section_group ?? inf.section_group,
    enabled: fields.enabled ?? true,
    sort_order,
    notes: fields.notes,
  }
}

/** Default OBIS set for sidecar `read-basic-registers` (see docs / SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS). */
export const SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS: readonly string[] = [
  "0.0.1.0.0.255",
  "1.0.1.8.0.255",
  "1.0.32.7.0.255",
]

/** OBIS rows populated from a single `read-identity` call (IdentityPayload field mapping). */
export const IDENTITY_READ_MAPPED_OBIS: readonly string[] = [
  "0.0.96.1.0.255",
  "0.0.96.1.1.255",
]

export const OBIS_CATALOG_SEED: ObisCatalogEntry[] = [
  // Basic setting
  e("basic_setting", 1, "0.0.96.1.0.255", "Canonical meter serial / business id (device id #1)", {
    object_type: "Data",
    class_id: 1,
    attribute: 2,
    notes: "Mapped from identity read: IdentityPayload.serialNumber only (OBIS 0.0.96.1.0.255 on wire).",
  }),
  e("basic_setting", 2, "0.0.96.1.1.255", "Auxiliary device identity (device id #2)", {
    object_type: "Data",
    class_id: 1,
    attribute: 2,
    notes: "Mapped from identity read: IdentityPayload.logicalDeviceName only (OBIS 0.0.96.1.1.255). Never substitutes canonical serial.",
  }),
  e("basic_setting", 3, "0.0.1.0.0.255", "Date and time (clock)", {
    object_type: "Clock",
    class_id: 1,
    unit: "local",
    notes: "In default basic-registers pack on sidecar.",
  }),
  e("basic_setting", 4, "0.0.42.0.0.255", "Protocol version", {
    object_type: "Data",
    class_id: 1,
  }),
  // Energy
  e("energy", 1, "1.0.1.8.0.255", "Active energy import (+A) — total", {
    unit: "kWh",
    notes: "In default basic-registers pack.",
  }),
  e("energy", 2, "1.0.2.8.0.255", "Active energy export (−A) — total", {
    unit: "kWh",
  }),
  e("energy", 3, "1.0.3.8.0.255", "Reactive energy import (+Ri) — total", {
    unit: "kvarh",
  }),
  e("energy", 4, "1.0.4.8.0.255", "Reactive energy export (−Rc) — total", {
    unit: "kvarh",
  }),
  // Instantaneous
  e("instantaneous", 1, "1.0.32.7.0.255", "Voltage L1", {
    unit: "V",
    notes: "In default basic-registers pack.",
  }),
  e("instantaneous", 2, "1.0.52.7.0.255", "Voltage L2", { unit: "V" }),
  e("instantaneous", 3, "1.0.72.7.0.255", "Voltage L3", { unit: "V" }),
  e("instantaneous", 4, "1.0.31.7.0.255", "Current L1", { unit: "A" }),
  e("instantaneous", 5, "1.0.51.7.0.255", "Current L2", { unit: "A" }),
  e("instantaneous", 6, "1.0.71.7.0.255", "Current L3", { unit: "A" }),
  e("instantaneous", 7, "1.0.14.7.0.255", "Supply frequency", { unit: "Hz" }),
  // Power
  e("power", 1, "1.0.1.7.0.255", "Active power import (+A) — total", {
    unit: "kW",
  }),
  e("power", 2, "1.0.2.7.0.255", "Active power export (−A) — total", {
    unit: "kW",
  }),
  e("power", 3, "1.0.3.7.0.255", "Reactive power import (+Ri) — total", {
    unit: "kvar",
  }),
  e("power", 4, "1.0.4.7.0.255", "Reactive power export (−Rc) — total", {
    unit: "kvar",
  }),
  e("power", 5, "1.0.9.7.0.255", "Apparent power import (+A) — total", {
    unit: "kVA",
  }),
  e("power", 6, "1.0.10.7.0.255", "Apparent power export (−A) — total", {
    unit: "kVA",
  }),
  e("power", 7, "1.0.21.7.0.255", "Active power L1", { unit: "kW" }),
  e("power", 8, "1.0.22.7.0.255", "Active power L2", { unit: "kW" }),
  e("power", 9, "1.0.23.7.0.255", "Active power L3", { unit: "kW" }),
  e("power", 10, "1.0.24.7.0.255", "Active power — calculated sum", {
    unit: "kW",
  }),
  e("power", 11, "1.0.29.7.0.255", "Reactive power L1", { unit: "kvar" }),
  e("power", 12, "1.0.30.7.0.255", "Reactive power — calculated sum", {
    unit: "kvar",
  }),
  // Demand
  e("demand", 1, "1.0.1.4.0.255", "Active import demand (+A)", {
    class_id: 5,
    unit: "kW",
  }),
  e("demand", 2, "1.0.2.4.0.255", "Active export demand (−A)", {
    class_id: 5,
    unit: "kW",
  }),
  e("demand", 3, "1.0.3.4.0.255", "Reactive import demand (+Ri)", {
    class_id: 5,
    unit: "kvar",
  }),
  e("demand", 4, "1.0.4.4.0.255", "Reactive export demand (−Rc)", {
    class_id: 5,
    unit: "kvar",
  }),
  e("demand", 5, "1.0.9.4.0.255", "Apparent import demand (+A)", {
    class_id: 5,
    unit: "kVA",
  }),
  e("demand", 6, "1.0.10.4.0.255", "Apparent export demand (−A)", {
    class_id: 5,
    unit: "kVA",
  }),
  e("demand", 7, "1.0.15.4.0.255", "Last demand reset timestamp", {
    class_id: 5,
    object_type: "DemandRegister",
    unit: "",
  }),
  // Event logs
  e("event_logs", 1, "0.0.96.11.0.255", "Event filter — list", {
    object_type: "ProfileGeneric",
    class_id: 7,
    attribute: 2,
  }),
  e("event_logs", 2, "0.0.96.11.1.255", "Event filter — buffer", {
    object_type: "ProfileGeneric",
    class_id: 7,
  }),
  e("event_logs", 3, "0.0.96.11.2.255", "Event filter — capture objects", {
    object_type: "ProfileGeneric",
    class_id: 7,
  }),
  e("event_logs", 4, "0.0.96.11.4.255", "Event filter — entries in use", {
    object_type: "ProfileGeneric",
    class_id: 7,
  }),
  e("event_logs", 5, "0.0.96.11.5.255", "Event filter — profile entries", {
    object_type: "ProfileGeneric",
    class_id: 7,
  }),
  // Load profile
  e("load_profile", 1, "1.0.99.1.0.255", "Load profile (generic)", {
    object_type: "ProfileGeneric",
    class_id: 7,
    notes: "Typical load profile logical name; device-specific.",
  }),
]

export function getCatalogRowsForPack(pack: ObisPackKey): ObisCatalogEntry[] {
  return getCatalogRowsForPackFromRows(OBIS_CATALOG_SEED, pack)
}

export function getCatalogRowsForPackFromRows(
  rows: ObisCatalogEntry[],
  pack: ObisPackKey
): ObisCatalogEntry[] {
  return rows.filter((r) => r.pack_key === pack).sort((a, b) => a.sort_order - b.sort_order)
}

/** Pack tabs: built-in order first, then other keys present in rows (sorted). */
export function packKeysForCatalogRows(rows: ObisCatalogEntry[]): ObisPackKey[] {
  const present = new Set(rows.map((r) => r.pack_key))
  const ordered = OBIS_PACK_ORDER.filter((k) => present.has(k))
  const extra = [...present]
    .filter((k) => !OBIS_PACK_ORDER.includes(k))
    .sort()
  return [...ordered, ...extra]
}

/** Tab order with only families that appear in rows. */
export function familyTabsPresent(rows: ObisCatalogEntry[]): ObisFamilyTab[] {
  const seen = new Set(rows.map((r) => r.family_tab))
  return (["basic", "energy", "profile"] as const).filter((t) => seen.has(t))
}

/** Distinct pack_key values for a family, sorted by section label. */
export function packKeysForFamily(rows: ObisCatalogEntry[], family: ObisFamilyTab): ObisPackKey[] {
  const keys = new Set<string>()
  for (const r of rows) {
    if (r.family_tab === family) keys.add(r.pack_key)
  }
  return [...keys].sort((a, b) => {
    const la =
      rows.find((x) => x.pack_key === a)?.section_group ?? a
    const lb =
      rows.find((x) => x.pack_key === b)?.section_group ?? b
    return la.localeCompare(lb)
  })
}

export function getCatalogRowsForFamilyAndPackFromRows(
  rows: ObisCatalogEntry[],
  family: ObisFamilyTab,
  pack: ObisPackKey
): ObisCatalogEntry[] {
  return rows
    .filter((r) => r.family_tab === family && r.pack_key === pack)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function sectionLabelForPack(
  rows: ObisCatalogEntry[],
  pack_key: ObisPackKey
): string {
  const r = rows.find((x) => x.pack_key === pack_key)
  return (r?.section_group ?? "").trim() || packLabel(pack_key)
}

export function getCatalogEntry(obis: string): ObisCatalogEntry | undefined {
  return OBIS_CATALOG_SEED.find((r) => r.obis === obis)
}
