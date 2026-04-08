import { operatorRunDisplayStatus } from "@/lib/commands/operator-run-display-status"
import type { CommandJobRow, CommandTemplateId } from "@/types/command"
import type {
  OperatorCommandRun,
  OperatorRunDisplayStatus,
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

function legacyJobDisplayStatus(
  row: CommandJobRow
): OperatorRunDisplayStatus | null {
  const q = row.queueState
  if (q === "submitted" || q === "queued" || q === "dispatching") {
    return "pending"
  }
  if (q === "running") return "running"
  if (q === "failed" || q === "partial_failure" || q === "cancelled") {
    return "failed"
  }
  if (q === "completed") {
    if (row.failedCount > 0) return "failed"
    return "success"
  }
  return "failed"
}

function meterOutcomeBrief(row: OperatorCommandRun): string | null {
  const pr = row.perMeterResults
  if (!pr || pr.length === 0) return null
  const ok = pr.filter((p) => p.state === "success").length
  return `${ok}/${pr.length} meters ok`
}

export function failureHintFromOperatorRun(
  row: OperatorCommandRun
): string | null {
  const fails = row.perMeterResults?.filter((p) => p.state === "failed") ?? []
  if (fails.length > 0) {
    const f = fails[0]!
    const base = `${f.serialNumber}: ${f.summary}`
      .replace(/\s+/g, " ")
      .slice(0, 200)
    const extra =
      f.errorDetail && !base.includes(f.errorDetail.slice(0, 24))
        ? ` — ${f.errorDetail.replace(/\s+/g, " ").slice(0, 120)}`
        : ""
    return `${base}${extra}`.slice(0, 280)
  }
  if (row.errorSummary && (row.status === "failed" || row.status === "cancelled")) {
    return row.errorSummary.slice(0, 280)
  }
  return null
}

export function operatorRunToUnified(
  row: OperatorCommandRun
): UnifiedCommandRunRow {
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
    operatorDisplayStatus: operatorRunDisplayStatus(row),
    targetSummary: row.targetSummary,
    status: row.status,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    resultSummary: row.resultSummary,
    errorSummary: row.errorSummary,
    notes: row.executionNote || null,
    meterOutcomeBrief: meterOutcomeBrief(row),
    failureHint: failureHintFromOperatorRun(row),
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
    operatorDisplayStatus: legacyJobDisplayStatus(row),
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
    failureHint: null,
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
