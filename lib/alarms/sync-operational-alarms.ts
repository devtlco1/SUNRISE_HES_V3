import { readOperatorRunsRaw } from "@/lib/commands/operator-file"
import { normalizeOperatorRuns } from "@/lib/commands/operator-normalize"
import { buildPhase2HintsBySerial } from "@/lib/connectivity-events/phase2-hints"
import { readConnectivityEventsRaw } from "@/lib/connectivity-events/store"
import type { OperatorCommandRun } from "@/types/command-operator"
import type { ConnectivityEventRecord } from "@/types/connectivity-events"
import type { OperationalAlarmRecord } from "@/types/operational-alarm"

import {
  readOperationalAlarmsRaw,
  writeOperationalAlarmsArray,
} from "@/lib/alarms/operational-store"

const MS_48H = 48 * 60 * 60 * 1000
const MS_24H = 24 * 60 * 60 * 1000

function serialKey(s: string): string {
  return s.trim().toLowerCase()
}

function sortEventsNewestFirst(events: ConnectivityEventRecord[]): ConnectivityEventRecord[] {
  return [...events].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  )
}

function newestEventForSerial(
  eventsNewestFirst: ConnectivityEventRecord[],
  serial: string,
  nowMs: number,
  maxAgeMs: number
): ConnectivityEventRecord | null {
  const k = serialKey(serial)
  for (const e of eventsNewestFirst) {
    if (serialKey(e.meterSerial ?? "") !== k) continue
    const t = Date.parse(e.createdAt)
    if (!Number.isFinite(t)) continue
    if (nowMs - t > maxAgeMs) return null
    return e
  }
  return null
}

function runHasOperatorFailure(run: OperatorCommandRun): boolean {
  if (run.status === "failed") return true
  if (run.status === "completed") {
    return (run.perMeterResults ?? []).some((p) => p.state === "failed")
  }
  return false
}

function commandAlarmType(
  run: OperatorCommandRun
): "command_run_failed" | "command_batch_partial" {
  if (run.status === "failed") return "command_run_failed"
  return "command_batch_partial"
}

function buildDesiredAlarms(
  eventsNewestFirst: ConnectivityEventRecord[],
  runs: OperatorCommandRun[],
  nowMs: number
): Map<string, OperationalAlarmRecord> {
  const desired = new Map<string, OperationalAlarmRecord>()
  const nowIso = new Date(nowMs).toISOString()

  const hints = buildPhase2HintsBySerial(eventsNewestFirst, nowMs)
  for (const [k, hint] of hints) {
    if (!hint.unstable) continue
    const sample = eventsNewestFirst.find((e) => serialKey(e.meterSerial ?? "") === k)
    const id = `op-conn-unstable-${k}`
    desired.set(id, {
      id,
      sourceType: "connectivity",
      sourceId: sample?.id ?? null,
      meterId: sample?.meterId?.trim() || null,
      meterSerial: sample?.meterSerial?.trim() || k,
      severity: "warning",
      alarmType: "connectivity_unstable",
      title: "Unstable meter communication",
      message: `${hint.recentFailureCount} failure events in 45m window — ${hint.lastEventSummary}`,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      clearedAt: null,
      metadata: {
        recentFailureCount: hint.recentFailureCount,
        lastEventType: hint.lastEventType,
      },
    })
  }

  const serialsSeen = new Set<string>()
  for (const e of eventsNewestFirst) {
    const s = e.meterSerial?.trim()
    if (!s) continue
    serialsSeen.add(serialKey(s))
  }

  for (const sk of serialsSeen) {
    const head48 = newestEventForSerial(eventsNewestFirst, sk, nowMs, MS_48H)
    if (head48?.eventType === "association_failed") {
      const id = `op-conn-assoc-${sk}`
      desired.set(id, {
        id,
        sourceType: "connectivity",
        sourceId: head48.id,
        meterId: head48.meterId?.trim() || null,
        meterSerial: head48.meterSerial?.trim() || sk,
        severity: "critical",
        alarmType: "association_failed",
        title: "Association failure",
        message: head48.message.slice(0, 500),
        status: "active",
        createdAt: nowIso,
        updatedAt: nowIso,
        clearedAt: null,
        metadata: { eventType: head48.eventType },
      })
    }
    if (head48?.eventType === "identify_failed") {
      const id = `op-conn-identify-${sk}`
      desired.set(id, {
        id,
        sourceType: "connectivity",
        sourceId: head48.id,
        meterId: head48.meterId?.trim() || null,
        meterSerial: head48.meterSerial?.trim() || sk,
        severity: "warning",
        alarmType: "identify_failed",
        title: "Identify / handshake failure",
        message: head48.message.slice(0, 500),
        status: "active",
        createdAt: nowIso,
        updatedAt: nowIso,
        clearedAt: null,
        metadata: { eventType: head48.eventType },
      })
    }
  }

  for (const sk of serialsSeen) {
    const head24 = newestEventForSerial(eventsNewestFirst, sk, nowMs, MS_24H)
    if (head24?.eventType === "relay_failed") {
      const id = `op-relay-${sk}`
      desired.set(id, {
        id,
        sourceType: "relay",
        sourceId: head24.id,
        meterId: head24.meterId?.trim() || null,
        meterSerial: head24.meterSerial?.trim() || sk,
        severity: "warning",
        alarmType: "relay_failure",
        title: "Relay command failure",
        message: head24.message.slice(0, 500),
        status: "active",
        createdAt: nowIso,
        updatedAt: nowIso,
        clearedAt: null,
        metadata: { eventType: head24.eventType },
      })
    }
    if (head24?.eventType === "read_failed") {
      const id = `op-read-${sk}`
      desired.set(id, {
        id,
        sourceType: "reading",
        sourceId: head24.id,
        meterId: head24.meterId?.trim() || null,
        meterSerial: head24.meterSerial?.trim() || sk,
        severity: "warning",
        alarmType: "read_failure",
        title: "Read / data exchange failure",
        message: head24.message.slice(0, 500),
        status: "active",
        createdAt: nowIso,
        updatedAt: nowIso,
        clearedAt: null,
        metadata: { eventType: head24.eventType },
      })
    }
  }

  for (const run of runs) {
    if (!runHasOperatorFailure(run)) continue
    const id = `op-cmd-${run.id}`
    const atype = commandAlarmType(run)
    const sev: OperationalAlarmRecord["severity"] =
      run.status === "failed" ? "warning" : "warning"
    const title =
      run.status === "failed"
        ? "Command run failed"
        : "Command run finished with meter failures"
    const msg =
      (run.errorSummary || run.resultSummary || "").slice(0, 500) ||
      "See Commands run history for details."
    desired.set(id, {
      id,
      sourceType: "commands",
      sourceId: run.id,
      meterId: null,
      meterSerial: null,
      severity: sev,
      alarmType: atype,
      title,
      message: msg,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
      clearedAt: null,
      metadata: {
        scheduleId: run.scheduleId,
        actionType: run.actionType,
        sourceTypeRun: run.sourceType,
      },
    })
  }

  return desired
}

function mergeAlarms(
  existing: OperationalAlarmRecord[],
  desired: Map<string, OperationalAlarmRecord>,
  nowIso: string
): OperationalAlarmRecord[] {
  const byId = new Map(existing.map((a) => [a.id, a]))

  for (const d of desired.values()) {
    const prev = byId.get(d.id)
    if (prev) {
      byId.set(d.id, {
        ...d,
        createdAt: prev.createdAt,
        status: "active",
        clearedAt: null,
        updatedAt: nowIso,
      })
    } else {
      byId.set(d.id, {
        ...d,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
    }
  }

  for (const [id, row] of byId) {
    if (row.status !== "active") continue
    if (!desired.has(id)) {
      byId.set(id, {
        ...row,
        status: "cleared",
        clearedAt: nowIso,
        updatedAt: nowIso,
      })
    }
  }

  return [...byId.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  )
}

/**
 * Reconciles persisted operational alarms with connectivity events and command runs.
 */
export async function syncOperationalAlarmsFromSources(): Promise<
  | { ok: true; alarms: OperationalAlarmRecord[] }
  | { ok: false; error: string }
> {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  const evRes = await readConnectivityEventsRaw()
  if (!evRes.ok) {
    return { ok: false, error: evRes.error }
  }
  const events = sortEventsNewestFirst(evRes.events)

  const runRaw = await readOperatorRunsRaw()
  const runs =
    runRaw.ok ? normalizeOperatorRuns(runRaw.parsed) : ([] as OperatorCommandRun[])

  const desired = buildDesiredAlarms(events, runs, nowMs)
  const existing = await readOperationalAlarmsRaw()
  const merged = mergeAlarms(existing, desired, nowIso)

  const w = await writeOperationalAlarmsArray(merged)
  if (!w.ok) {
    return { ok: false, error: w.error }
  }
  return { ok: true, alarms: merged }
}
