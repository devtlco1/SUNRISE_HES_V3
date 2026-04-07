/**
 * Map runtime envelopes into per-OBIS row state for the readings table.
 */

import type {
  BasicRegistersPayload,
  IdentityPayload,
  ObisSelectionJobRowPollView,
  ObisSelectionRowResult,
  ReadObisSelectionPayload,
} from "@/types/runtime"

import { IDENTITY_READ_MAPPED_OBIS, SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS } from "./catalog-seed"

export type ObisRowReadState = {
  result: string
  status: "ok" | "error" | "skipped"
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
    else if (r.status === "unsupported" || r.status === "not_attempted") st = "skipped"
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
