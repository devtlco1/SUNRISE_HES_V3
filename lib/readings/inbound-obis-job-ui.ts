/**
 * Shared inbound OBIS job UI mapping (progress line + terminal envelope → meter patch fields).
 */

import type {
  ObisSelectionJobPollView,
  ReadObisSelectionPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export function obisInboundJobProgressLine(snap: ObisSelectionJobPollView): string {
  const wDone = snap.completedWire
  const wTot = snap.wireTotal
  const cur = snap.currentObis
  let line = `${wDone} / ${wTot} wire rows`
  if (snap.status === "waiting_for_restage") {
    line = `Waiting for restage — ${wDone} / ${wTot} wire rows`
    const rm = snap.restageMessage
    if (typeof rm === "string" && rm.trim()) line += `. ${rm.trim()}`
  } else if (cur) {
    line += ` — running: ${cur}`
  }
  if (
    snap.stale &&
    (snap.status === "running" || snap.status === "waiting_for_restage")
  ) {
    line += " (stale: job may be stuck)"
  }
  return line
}

export function obisInboundJobTerminalPatch(snap: ObisSelectionJobPollView): {
  readOk: boolean
  finalActionErr: string | null
  lastEnv: RuntimeResponseEnvelope<ReadObisSelectionPayload> | null
} {
  const okWire = snap.rows.filter((r) => r.row?.status === "ok").length
  let finalActionErr: string | null = null
  let readOk = false
  const lastEnv =
    (snap.envelope as RuntimeResponseEnvelope<ReadObisSelectionPayload> | null) ?? null

  if (snap.status === "cancelled") {
    finalActionErr =
      okWire > 0
        ? `Stopped after ${okWire} ok row(s).`
        : snap.envelope?.error?.message ??
          snap.envelope?.message ??
          "Stopped by operator."
  } else if (snap.fatalError) {
    finalActionErr =
      okWire > 0
        ? `Session ended after ${okWire} ok row(s). ${snap.fatalError}`
        : snap.fatalError
  } else if (snap.envelope && !snap.envelope.ok) {
    const msg =
      snap.envelope.error?.message ?? snap.envelope.message ?? "readObisSelection failed"
    finalActionErr = okWire > 0 ? `Session ended after ${okWire} ok row(s). ${msg}` : msg
  } else {
    finalActionErr = null
    readOk = true
  }

  return { readOk, finalActionErr, lastEnv }
}
