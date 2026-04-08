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

export function operatorRunToUnified(row: OperatorCommandRun): UnifiedCommandRunRow {
  return {
    id: row.id,
    source: "operator",
    actionType: row.actionType,
    targetSummary: row.targetSummary,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    resultSummary: row.resultSummary,
    errorSummary: row.errorSummary,
    notes: row.executionNote || null,
  }
}

export function legacyJobToUnified(row: CommandJobRow): UnifiedCommandRunRow {
  return {
    id: `legacy:${row.id}`,
    source: "legacy_catalog",
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
