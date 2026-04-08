/**
 * Convert `data/obis-catalogs/st34-hw08-user-manual-3ph.yaml` into `ObisCatalogEntry[]`
 * for merge into `data/obis-catalog.json`.
 */

import { readFile } from "fs/promises"
import path from "path"
import { parse as parseYaml } from "yaml"

import { inferFamilySectionFromLegacyPack } from "@/lib/obis/family-section"
import { INVALID_OBIS_SHAPE_NOTE, isValidCosemObisLogicalName } from "@/lib/obis/obis-logical-name"
import type { ObisCatalogEntry, ObisPackKey } from "@/lib/obis/types"

export const ST34_HW08_YAML_REL_PATH = path.join(
  "data",
  "obis-catalogs",
  "st34-hw08-user-manual-3ph.yaml",
)

type YamlItem = {
  obis?: string
  description?: string
  unit?: string | null
  scaler?: number | null
  note?: string
}

type YamlGroup = {
  group?: string
  items?: YamlItem[]
}

type YamlRoot = {
  meter_model?: string
  source?: string
  notes?: string[]
  obis_catalog?: YamlGroup[]
}

const TARIFF_INDICES = [1, 2, 3, 4] as const

function packKeyForYamlGroup(group: string): ObisPackKey {
  const g = group.trim().toLowerCase()
  if (g.includes("metering")) return "energy"
  if (g.includes("net energy")) return "energy"
  if (g.includes("instantaneous")) return "instantaneous"
  if (g.includes("max") && g.includes("min")) return "instantaneous"
  if (g.includes("average")) return "load_profile"
  return "energy"
}

function expandObisPattern(obis: string): string[] {
  if (obis.includes(".x.")) {
    return TARIFF_INDICES.map((t) => obis.replace(".x.", `.${t}.`))
  }
  return [obis]
}

function inferRegisterMeta(obis: string): Pick<
  ObisCatalogEntry,
  "object_type" | "class_id" | "attribute" | "scaler_unit_attribute"
> {
  const compact = obis.replace(/\./g, "")
  if (obis.startsWith("0.0.") || compact.length < 8) {
    return {
      object_type: "Data",
      class_id: 1,
      attribute: 2,
      scaler_unit_attribute: 3,
    }
  }
  return {
    object_type: "Register",
    class_id: 3,
    attribute: 2,
    scaler_unit_attribute: 3,
  }
}

function buildNotes(
  meterModel: string,
  source: string,
  scaler: number | null | undefined,
  itemNote: string | undefined,
  tariffIndex: number | null,
): string | undefined {
  const parts: string[] = [
    `ST34-HW08 manual (${meterModel})`,
    `Source: ${source}`,
  ]
  if (tariffIndex !== null) {
    parts.push(`Tariff index ${tariffIndex}`)
  }
  if (scaler !== null && scaler !== undefined && Number.isFinite(scaler)) {
    parts.push(`Manual scaler exponent: ${scaler}`)
  }
  if (itemNote?.trim()) {
    parts.push(itemNote.trim())
  }
  return parts.join(" · ")
}

function yamlItemToEntries(
  item: YamlItem,
  pack_key: ObisPackKey,
  meterModel: string,
  source: string,
): ObisCatalogEntry[] {
  const rawObis = typeof item.obis === "string" ? item.obis.trim() : ""
  if (!rawObis) return []
  const description = typeof item.description === "string" ? item.description.trim() : "—"
  const unit =
    item.unit === null || item.unit === undefined ? "" : String(item.unit).trim()
  const expanded = expandObisPattern(rawObis)
  const meta = inferRegisterMeta(expanded[0] ?? rawObis)
  const out: ObisCatalogEntry[] = []
  let i = 0
  for (const obis of expanded) {
    const tariffIdx = rawObis.includes(".x.") ? TARIFF_INDICES[i] ?? null : null
    const desc =
      tariffIdx !== null && expanded.length > 1
        ? `${description} (tariff ${tariffIdx})`
        : description
    const notes = buildNotes(meterModel, source, item.scaler ?? null, item.note, tariffIdx)
    const shapeOk = isValidCosemObisLogicalName(obis)
    const notesWithShape = shapeOk
      ? notes
      : [notes, INVALID_OBIS_SHAPE_NOTE].filter(Boolean).join(" · ")
    const loc = inferFamilySectionFromLegacyPack(pack_key)
    out.push({
      obis,
      description: desc,
      ...meta,
      unit,
      result_format: "scalar",
      status: "catalog_only",
      pack_key,
      family_tab: loc.family_tab,
      section_group: loc.section_group,
      enabled: shapeOk,
      sort_order: 0,
      notes: notesWithShape,
    })
    i += 1
  }
  return out
}

/** Parse YAML text → catalog rows (not deduped across repeated calls). */
export function st34Hw08YamlTextToCatalogEntries(yamlText: string): ObisCatalogEntry[] {
  const doc = parseYaml(yamlText) as YamlRoot
  const catalog = doc?.obis_catalog
  if (!Array.isArray(catalog)) return []

  const meterModel = typeof doc.meter_model === "string" ? doc.meter_model : "ST34-HW08"
  const source = typeof doc.source === "string" ? doc.source : "User Manual 3PH ST34-HW08"

  const rows: ObisCatalogEntry[] = []
  for (const block of catalog) {
    const groupName = typeof block?.group === "string" ? block.group : "unknown"
    const pack_key = packKeyForYamlGroup(groupName)
    const items = Array.isArray(block?.items) ? block.items : []
    for (const item of items) {
      rows.push(...yamlItemToEntries(item, pack_key, meterModel, source))
    }
  }
  return rows
}

export async function readSt34Hw08YamlFile(cwd: string = process.cwd()): Promise<string> {
  const p = path.join(cwd, ST34_HW08_YAML_REL_PATH)
  return readFile(p, "utf-8")
}

export async function loadSt34Hw08CatalogEntriesFromDisk(
  cwd: string = process.cwd(),
): Promise<ObisCatalogEntry[]> {
  const text = await readSt34Hw08YamlFile(cwd)
  return st34Hw08YamlTextToCatalogEntries(text)
}
