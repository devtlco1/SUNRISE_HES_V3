import type { ObisCatalogEntry } from "@/lib/obis/types"
import type { CommandActionGroup, CommandSchedule } from "@/types/command-operator"

import {
  buildObjectCodeSupportFromRows,
  type ObjectCodeSupportMap,
  type ReadResultsCsvRow,
} from "@/lib/obis/read-results-csv"

export type CatalogPruneApplyResult = {
  catalog: ObisCatalogEntry[]
  actionGroups: CommandActionGroup[]
  schedules: CommandSchedule[]
  stats: {
    csvDataRows: number
    distinctObjectCodesInCsv: number
    supportedOkDistinct: number
    catalogRowsEnabled: number
    catalogRowsDisabled: number
    actionGroupsCodesRemoved: number
    actionGroupsDeleted: number
    schedulesTouched: number
  }
}

function catalogKey(oc: string): string {
  return oc.trim().toLowerCase()
}

/**
 * Apply read-results support map to catalog rows (mutates logical enabled/status).
 * Strict: codes never seen in CSV are disabled (deployment CSV is full truth for this run).
 */
export function applyReadResultsSupportToCatalog(
  catalog: ObisCatalogEntry[],
  support: ObjectCodeSupportMap
): { next: ObisCatalogEntry[]; enabled: number; disabled: number } {
  const next = catalog.map((row) => {
    const key = catalogKey(row.object_code)
    const hit = support.get(key)
    const allow = hit?.hasOk === true
    if (allow) {
      return {
        ...row,
        enabled: true,
        status: "active" as const,
      }
    }
    return {
      ...row,
      enabled: false,
      status: "catalog_only" as const,
    }
  })
  const enabled = next.filter((r) => r.enabled).length
  return { next, enabled, disabled: next.length - enabled }
}

function filterGroupObjectCodes(
  group: CommandActionGroup,
  support: ObjectCodeSupportMap
): { group: CommandActionGroup; removed: number } {
  if (group.actionMode !== "read_catalog") {
    return { group, removed: 0 }
  }
  const before = group.objectCodes.length
  const kept = group.objectCodes.filter((c) => {
    const hit = support.get(catalogKey(c))
    return hit?.hasOk === true
  })
  const removed = before - kept.length
  return {
    group: {
      ...group,
      objectCodes: kept,
      updatedAt: new Date().toISOString(),
    },
    removed,
  }
}

/**
 * Remove unsupported codes from read_catalog action groups; delete empty read groups.
 * Disables schedules that referenced a deleted or emptied read group.
 */
export function reconcileCommandArtifactsAfterCatalogPrune(params: {
  actionGroups: CommandActionGroup[]
  schedules: CommandSchedule[]
  support: ObjectCodeSupportMap
}): {
  actionGroups: CommandActionGroup[]
  schedules: CommandSchedule[]
  groupsCodesRemoved: number
  groupsDeleted: number
  schedulesTouched: number
} {
  let groupsCodesRemoved = 0
  const deletedIds = new Set<string>()
  const rebuiltGroups: CommandActionGroup[] = []

  for (const g of params.actionGroups) {
    const { group, removed } = filterGroupObjectCodes(g, params.support)
    groupsCodesRemoved += removed
    if (group.actionMode === "read_catalog" && group.objectCodes.length === 0) {
      deletedIds.add(group.id)
      continue
    }
    rebuiltGroups.push(group)
  }

  const now = new Date().toISOString()
  let schedulesTouched = 0
  const schedules = params.schedules.map((s) => {
    if (!s.obisCodeGroupId || !deletedIds.has(s.obisCodeGroupId)) {
      return s
    }
    schedulesTouched++
    const note =
      "[obis-prune] OBIS action group removed or emptied — pick a new group."
    const notesBase = (s.notes ?? "").trim()
    return {
      ...s,
      enabled: false,
      obisCodeGroupId: null,
      notes: notesBase ? `${notesBase}\n${note}` : note,
      updatedAt: now,
      nextRunAt: null,
    }
  })

  return {
    actionGroups: rebuiltGroups,
    schedules,
    groupsCodesRemoved,
    groupsDeleted: deletedIds.size,
    schedulesTouched,
  }
}

export function applyCatalogPruneFromReadResultsRows(
  catalog: ObisCatalogEntry[],
  actionGroups: CommandActionGroup[],
  schedules: CommandSchedule[],
  csvRows: ReadResultsCsvRow[]
): CatalogPruneApplyResult {
  const support = buildObjectCodeSupportFromRows(csvRows)
  const distinctObjectCodesInCsv = support.size
  let supportedOkDistinct = 0
  for (const v of support.values()) {
    if (v.hasOk) supportedOkDistinct++
  }

  const cat = applyReadResultsSupportToCatalog(catalog, support)
  const rec = reconcileCommandArtifactsAfterCatalogPrune({
    actionGroups,
    schedules,
    support,
  })

  return {
    catalog: cat.next,
    actionGroups: rec.actionGroups,
    schedules: rec.schedules,
    stats: {
      csvDataRows: csvRows.length,
      distinctObjectCodesInCsv,
      supportedOkDistinct,
      catalogRowsEnabled: cat.enabled,
      catalogRowsDisabled: cat.disabled,
      actionGroupsCodesRemoved: rec.groupsCodesRemoved,
      actionGroupsDeleted: rec.groupsDeleted,
      schedulesTouched: rec.schedulesTouched,
    },
  }
}
