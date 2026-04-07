/**
 * Map runtime envelopes into per-OBIS row state for the readings table.
 */

import type {
  BasicRegistersPayload,
  IdentityPayload,
  ObisSelectionJobPollView,
  ObisSelectionJobRowPollView,
  ObisSelectionRowResult,
  ReadObisSelectionPayload,
} from "@/types/runtime"

import { IDENTITY_READ_MAPPED_OBIS, SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS } from "./catalog-seed"

export type ObisRowReadState = {
  result: string
  status:
    | "ok"
    | "error"
    | "skipped"
    | "pending"
    | "running"
    | "unsupported"
    | "not_attempted"
  error?: string
  lastReadAt: string | null
}

export function emptyRowState(): ObisRowReadState {
  return { result: "", status: "skipped", lastReadAt: null }
}

export function mergeIdentityIntoRowState(
  prev: Record<string, ObisRowReadState>,
  payload: IdentityPayload,
  finishedAt: string
): Record<string, ObisRowReadState> {
  const next = { ...prev }
  const t = finishedAt

  const set = (obis: string, result: string, status: ObisRowReadState["status"], err?: string) => {
    next[obis] = { result, status, error: err, lastReadAt: t }
  }

  const ld = (payload.logicalDeviceName ?? "").trim()
  const sn = (payload.serialNumber ?? "").trim()
  const primary = ld || sn
  set(
    "0.0.96.1.0.255",
    primary,
    primary ? "ok" : "error",
    primary ? undefined : "no logical device name / serial"
  )
  set("0.0.96.1.1.255", sn, sn ? "ok" : "error", sn ? undefined : "no serial")

  return next
}

/** Merge readObisSelection payload rows into table state; other OBIS keys unchanged. */
export function mergeObisSelectionIntoRowState(
  prev: Record<string, ObisRowReadState>,
  payload: ReadObisSelectionPayload
): Record<string, ObisRowReadState> {
  const next = { ...prev }
  for (const r of payload.rows) {
    let st: ObisRowReadState["status"]
    if (r.status === "ok") st = "ok"
    else if (r.status === "unsupported") st = "unsupported"
    else if (r.status === "not_attempted") st = "not_attempted"
    else st = "error"

    const base = (r.value ?? "").trim()
    const u = (r.unit ?? "").trim()
    let result = base
    if (base && u) result = `${base} ${u}`
    else if (!base && u) result = u

    if (r.quality && r.quality !== "good" && r.status === "ok") {
      result = result ? `${result} (${r.quality})` : r.quality
    }

    next[r.obis] = {
      result,
      status: st,
      error: r.error,
      lastReadAt: r.lastReadAt ?? null,
    }
  }
  return next
}

/** Build a payload from job poll rows that have a concrete `row` result (for progressive UI merge). */
export function readObisSelectionPayloadFromJobPollRows(
  rows: ObisSelectionJobRowPollView[]
): ReadObisSelectionPayload {
  const list: ObisSelectionRowResult[] = []
  for (const rv of rows) {
    const r = rv.row
    if (r && typeof r === "object" && typeof r.obis === "string") {
      list.push(r as ObisSelectionRowResult)
    }
  }
  return { rows: list }
}

/** Merge full job poll snapshot into per-OBIS grid state (live phases + completed rows). */
export function mergeObisJobPollIntoRowState(
  prev: Record<string, ObisRowReadState>,
  job: ObisSelectionJobPollView
): Record<string, ObisRowReadState> {
  const next = { ...prev }
  const curObis =
    typeof job.currentObis === "string" && job.currentObis.trim() ? job.currentObis.trim() : null
  const terminal = job.status === "completed" || job.status === "failed"
  const fatal = (job.fatalError ?? "").trim()

  for (const rv of job.rows) {
    const obis = rv.obis
    const phase = (rv.phase || "").toLowerCase()
    const row = rv.row
    const existing = next[obis]

    if (row && typeof row === "object" && typeof (row as ObisSelectionRowResult).obis === "string") {
      const payload = mergeObisSelectionIntoRowState({}, {
        rows: [row as ObisSelectionRowResult],
      })
      const cell = payload[obis]
      if (cell) next[obis] = cell
      continue
    }

    if (existing?.status === "ok") continue

    if (phase === "running" || (!terminal && curObis === obis)) {
      next[obis] = {
        result: "…",
        status: "running",
        lastReadAt: null,
      }
      continue
    }
    if (phase === "queued") {
      next[obis] = {
        result: "",
        status: "pending",
        lastReadAt: null,
      }
      continue
    }
    if (phase === "unsupported") {
      next[obis] = {
        result: "",
        status: "unsupported",
        error: "unsupported",
        lastReadAt: null,
      }
      continue
    }
    if (phase === "not_attempted") {
      next[obis] = {
        result: "",
        status: "not_attempted",
        error: fatal || undefined,
        lastReadAt: null,
      }
      continue
    }
    if (phase === "error") {
      next[obis] = {
        result: "",
        status: "error",
        error: fatal || "read failed",
        lastReadAt: null,
      }
    }
  }

  if (terminal && job.status === "failed" && fatal) {
    for (const rv of job.rows) {
      const obis = rv.obis
      const cur = next[obis]
      if (cur?.status === "ok") continue
      const phase = (rv.phase || "").toLowerCase()
      if (phase === "queued" || phase === "running") {
        next[obis] = {
          result: "",
          status: "not_attempted",
          error: fatal,
          lastReadAt: null,
        }
      }
    }
  }

  return next
}

export function mergeBasicRegistersIntoRowState(
  prev: Record<string, ObisRowReadState>,
  payload: BasicRegistersPayload,
  finishedAt: string
): Record<string, ObisRowReadState> {
  const next = { ...prev }
  const regs = payload.registers ?? {}
  for (const obis of Object.keys(regs)) {
    const r = regs[obis]
    const val = (r?.value ?? "").trim()
    const err = r?.error
    if (err) {
      next[obis] = {
        result: val,
        status: "error",
        error: String(err),
        lastReadAt: finishedAt,
      }
    } else if (val) {
      next[obis] = {
        result: r?.unit ? `${val} ${r.unit}` : val,
        status: "ok",
        lastReadAt: finishedAt,
      }
    } else {
      next[obis] = {
        result: "",
        status: "error",
        error: "no value",
        lastReadAt: finishedAt,
      }
    }
  }
  return next
}

export function obisNeedsIdentityRead(obisList: string[]): boolean {
  return obisList.some((o) => IDENTITY_READ_MAPPED_OBIS.includes(o))
}

export function obisNeedsBasicRegistersRead(obisList: string[]): boolean {
  const set = new Set(SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS)
  return obisList.some((o) => set.has(o))
}

/** OBIS not satisfied by identity + default basic-registers calls. */
export function obisOutsideCurrentRuntimePack(obisList: string[]): string[] {
  const cover = new Set<string>([
    ...IDENTITY_READ_MAPPED_OBIS,
    ...SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS,
  ])
  return obisList.filter((o) => !cover.has(o))
}
