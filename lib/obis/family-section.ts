/**
 * Top-level OBIS catalog tabs (operator UI) vs section headings (spreadsheet / grouping).
 * Section headings do not map 1:1 to tabs — see KNOWN_SECTION_TO_PACK.
 */

import type { ObisFamilyTab, ObisPackKey } from "@/lib/obis/types"
import { packLabel } from "@/lib/obis/types"

export const FAMILY_TAB_ORDER: ObisFamilyTab[] = ["basic", "energy", "profile"]

export const FAMILY_TAB_LABELS: Record<ObisFamilyTab, string> = {
  basic: "Basic",
  energy: "Energy",
  profile: "Profile",
}

export function familyTabLabel(tab: ObisFamilyTab): string {
  return FAMILY_TAB_LABELS[tab] ?? tab
}

/** Normalize free text for section heading lookup (uppercase single spaces). */
export function normalizeSectionHeading(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase()
}

/**
 * Known Excel/operator section titles → UI tab + stable pack_key (aligns with seeded catalog).
 * Custom sections fall back to slugged pack under inferred family.
 */
export const KNOWN_SECTION_TO_PACK: Record<
  string,
  { family_tab: ObisFamilyTab; pack_key: ObisPackKey; display_section: string }
> = {
  "BASIC SETTING": {
    family_tab: "basic",
    pack_key: "basic_setting",
    display_section: "BASIC SETTING",
  },
  "INSTANTANEOUS VALUE": {
    family_tab: "basic",
    pack_key: "instantaneous",
    display_section: "INSTANTANEOUS VALUE",
  },
  "POWER": {
    family_tab: "basic",
    pack_key: "power",
    display_section: "POWER",
  },
  "MAXIMUM MDI": {
    family_tab: "profile",
    pack_key: "demand",
    display_section: "MAXIMUM MDI",
  },
  "ENERGY REGISTER": {
    family_tab: "energy",
    pack_key: "energy",
    display_section: "ENERGY REGISTER",
  },
  "CURRENT MDU": {
    family_tab: "profile",
    pack_key: "demand",
    display_section: "CURRENT MDU",
  },
  "HISTORY ENERGY": {
    family_tab: "energy",
    pack_key: "energy",
    display_section: "HISTORY ENERGY",
  },
  "BILLING PERIOD ENERGY": {
    family_tab: "energy",
    pack_key: "energy",
    display_section: "BILLING PERIOD ENERGY",
  },
  "BILING PERIOD ENERGY": {
    family_tab: "energy",
    pack_key: "energy",
    display_section: "BILLING PERIOD ENERGY",
  },
  "EVENT LOGS": {
    family_tab: "profile",
    pack_key: "event_logs",
    display_section: "EVENT LOGS",
  },
  "LOAD PROFILE": {
    family_tab: "profile",
    pack_key: "load_profile",
    display_section: "LOAD PROFILE",
  },
}

export function resolveKnownSection(raw: string): (typeof KNOWN_SECTION_TO_PACK)[string] | null {
  const k = normalizeSectionHeading(raw)
  if (k === "BILING PERIOD ENERGY") {
    return KNOWN_SECTION_TO_PACK["BILLING PERIOD ENERGY"] ?? null
  }
  return KNOWN_SECTION_TO_PACK[k] ?? null
}

/** Legacy persisted pack_key → tab + section label (for rows without explicit section). */
export function inferFamilySectionFromLegacyPack(pack_key: string): {
  family_tab: ObisFamilyTab
  section_group: string
} {
  for (const row of Object.values(KNOWN_SECTION_TO_PACK)) {
    if (row.pack_key === pack_key) {
      return { family_tab: row.family_tab, section_group: row.display_section }
    }
  }
  return {
    family_tab: "basic",
    section_group: packLabel(pack_key),
  }
}

export function parseFamilyTab(raw: unknown): ObisFamilyTab | null {
  if (typeof raw !== "string") return null
  const t = raw.trim().toLowerCase()
  if (t === "basic") return "basic"
  if (t === "energy") return "energy"
  if (t === "profile") return "profile"
  return null
}

/** Stable pack_key for a custom section under a family (no known mapping). */
export function packKeyForCustomSection(family_tab: ObisFamilyTab, section_group: string): ObisPackKey {
  const slug = normalizeSectionHeading(section_group)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
  const base = slug || "section"
  return `${family_tab}_${base}` as ObisPackKey
}

/**
 * Resolve family, human section label, and pack_key from import columns / inferred heading.
 */
export function resolveFamilySectionPack(params: {
  familyRaw?: string
  sectionRaw?: string
  legacyBasicSettingColumn?: string
}): { family_tab: ObisFamilyTab; section_group: string; pack_key: ObisPackKey } {
  const fromCol = (params.sectionRaw ?? "").trim() || (params.legacyBasicSettingColumn ?? "").trim()
  const parsedFamily = parseFamilyTab(params.familyRaw)

  if (fromCol) {
    const known = resolveKnownSection(fromCol)
    if (known) {
      return {
        family_tab: parsedFamily ?? known.family_tab,
        section_group: known.display_section,
        pack_key: known.pack_key,
      }
    }
    const family = parsedFamily ?? "basic"
    return {
      family_tab: family,
      section_group: fromCol.trim(),
      pack_key: packKeyForCustomSection(family, fromCol),
    }
  }

  return {
    family_tab: parsedFamily ?? "basic",
    section_group: "BASIC SETTING",
    pack_key: "basic_setting",
  }
}
