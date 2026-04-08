import type { CommandJobRow, CommandTemplateId } from "@/types/command"
import type {
  OperatorCommandRun,
  UnifiedCommandRunRow,
} from "@/types/command-operator"

function templateToActionLabel(id: CommandTemplateId): string {
  if (id === "disconnect_relay") return "relay_off"
  if (id === "reconnect_relay") return "relay_on"
  if (id === "on_demand_read" || id === "read_profile") return "read"
  return "other"
}

function parseRunDate(s: string): number {
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}

function meterOutcomeBrief(row: OperatorCommandRun): string | null {
  const pr = row.perMeterResults
  if (!pr || pr.length === 0) return null
  const ok = pr.filter((p) => p.state === "success").length
  return `${ok}/${pr.length} meters ok`
}

export function operatorRunToUnified(row: OperatorCommandRun): UnifiedCommandRunRow {
  return {
    id: row.id,
    source: "operator",
    operatorTrigger: row.sourceType,
    scheduleId: row.scheduleId,
    meterGroupId: row.meterGroupId,
    obisCodeGroupId: row.obisCodeGroupId,
    meterGroupName: row.meterGroupName || null,
    obisCodeGroupName: row.obisCodeGroupName || null,
    scheduleName: row.scheduleName || null,
    actionType: row.actionType,
    targetSummary: row.targetSummary,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    resultSummary: row.resultSummary,
    errorSummary: row.errorSummary,
    notes: row.executionNote || null,
    meterOutcomeBrief: meterOutcomeBrief(row),
  }
}

export function legacyJobToUnified(row: CommandJobRow): UnifiedCommandRunRow {
  return {
    id: `legacy:${row.id}`,
    source: "legacy_catalog",
    operatorTrigger: null,
    scheduleId: null,
    meterGroupId: null,
    obisCodeGroupId: null,
    meterGroupName: null,
    obisCodeGroupName: null,
    scheduleName: null,
    actionType: templateToActionLabel(row.templateId),
    targetSummary: `${row.targetCount} meter(s) · ${row.templateName}`,
    status: row.queueState,
    createdAt: row.submittedAt,
    startedAt: null,
    finishedAt: null,
    resultSummary: row.resultSummary,
    errorSummary:
      row.failedCount > 0
        ? `${row.failedCount} failed in batch`
        : null,
    notes: row.operatorNote ?? null,
    meterOutcomeBrief: null,
  }
}

export function mergeAndSortUnifiedRuns(
  operator: OperatorCommandRun[],
  legacy: CommandJobRow[]
): UnifiedCommandRunRow[] {
  const merged = [
    ...operator.map(operatorRunToUnified),
    ...legacy.map(legacyJobToUnified),
  ]
  merged.sort(
    (a, b) => parseRunDate(b.createdAt) - parseRunDate(a.createdAt)
  )
  return merged
}
