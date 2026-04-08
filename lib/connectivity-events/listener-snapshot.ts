import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import { appendConnectivityEventsBatch } from "./append"

import type { ConnectivityEventRecord } from "@/types/connectivity-events"

const FILE = "connectivity-listener-snapshot.json"

export type ListenerHoldSnap = {
  holdId: string
  pendingBind: boolean
  canonicalSerial: string
  remoteHost: string
  remotePort: number
  sessionState: string
  bindingSource?: string
  identifyError?: string
  acceptedAtUtc: string
}

export type ListenerSnapshotFile = {
  holds: Record<string, ListenerHoldSnap>
}

function snapshotPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

export async function loadListenerSnapshot(): Promise<ListenerSnapshotFile> {
  try {
    const text = await readFile(snapshotPath(), "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return { holds: {} }
    const o = parsed as Record<string, unknown>
    const holdsRaw = o.holds
    const holds: Record<string, ListenerHoldSnap> = {}
    if (holdsRaw && typeof holdsRaw === "object") {
      for (const [k, v] of Object.entries(holdsRaw)) {
        if (!v || typeof v !== "object") continue
        const h = v as Record<string, unknown>
        if (typeof h.holdId !== "string") continue
        holds[k] = h as unknown as ListenerHoldSnap
      }
    }
    return { holds }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ENOENT") return { holds: {} }
    return { holds: {} }
  }
}

export async function saveListenerSnapshot(s: ListenerSnapshotFile): Promise<void> {
  const filePath = snapshotPath()
  const dir = path.dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(s, null, 2)}\n`, "utf-8")
  await rename(tmp, filePath)
}

export function parseListenerHoldsFromStatus(
  status: Record<string, unknown> | null
): Record<string, ListenerHoldSnap> {
  if (!status) return {}
  const raw = status.stagedSessions
  if (!Array.isArray(raw)) return {}
  const out: Record<string, ListenerHoldSnap> = {}
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const holdId = typeof o.holdId === "string" ? o.holdId : ""
    if (!holdId) continue
    const rh = o.remoteHost
    const rp = o.remotePort
    const at = o.acceptedAtUtc
    if (typeof rh !== "string" || typeof rp !== "number" || typeof at !== "string") continue
    const pendingBind = o.pendingBind === true
    const canonicalSerial =
      typeof o.canonicalSerial === "string" ? o.canonicalSerial.trim() : ""
    const sessionState = typeof o.sessionState === "string" ? o.sessionState : ""
    const bindingSource =
      typeof o.bindingSource === "string" ? o.bindingSource : undefined
    const identifyError =
      typeof o.identifyError === "string" ? o.identifyError : undefined
    out[holdId] = {
      holdId,
      pendingBind,
      canonicalSerial,
      remoteHost: rh,
      remotePort: rp,
      sessionState,
      bindingSource,
      identifyError,
      acceptedAtUtc: at,
    }
  }
  return out
}

function newEvent(p: Omit<ConnectivityEventRecord, "id" | "createdAt"> & { createdAt?: string }): ConnectivityEventRecord {
  const createdAt = p.createdAt ?? new Date().toISOString()
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    id,
    createdAt,
    meterId: p.meterId,
    meterSerial: p.meterSerial,
    eventType: p.eventType,
    severity: p.severity,
    message: p.message,
    remoteHost: p.remoteHost,
    remotePort: p.remotePort,
    route: p.route,
    metadata: p.metadata,
    dedupeKey: p.dedupeKey,
  }
}

/**
 * Diff persisted listener holds vs current sidecar snapshot; append events; persist new snapshot.
 * Safe to call on every `/api/connectivity` refresh — transitions fire only once.
 */
export async function syncConnectivityEventsFromListenerStatus(
  status: Record<string, unknown> | null
): Promise<void> {
  if (!status) return

  const prevSnap = await loadListenerSnapshot()
  const prev = prevSnap.holds
  const next = parseListenerHoldsFromStatus(status)

  /** First-ever snapshot: persist current holds without emitting synthetic "connected" for all rows. */
  if (Object.keys(prev).length === 0 && Object.keys(next).length > 0) {
    await saveListenerSnapshot({ holds: next })
    return
  }

  const batch: ConnectivityEventRecord[] = []

  const prevIds = new Set(Object.keys(prev))
  const nextIds = new Set(Object.keys(next))

  const disconnected: ListenerHoldSnap[] = []
  for (const id of prevIds) {
    if (!nextIds.has(id)) disconnected.push(prev[id]!)
  }
  const connected: ListenerHoldSnap[] = []
  for (const id of nextIds) {
    if (!prevIds.has(id)) connected.push(next[id]!)
  }

  const serialOf = (h: ListenerHoldSnap) => h.canonicalSerial.trim()

  const discBound = disconnected.filter((h) => !h.pendingBind && serialOf(h))
  const connBound = connected.filter((h) => !h.pendingBind && serialOf(h))
  const usedDisc = new Set<string>()
  const usedConn = new Set<string>()

  for (const d of discBound) {
    const s = serialOf(d)
    const mateIdx = connBound.findIndex(
      (c, i) => !usedConn.has(c.holdId) && serialOf(c) === s
    )
    if (mateIdx < 0) continue
    const c = connBound[mateIdx]!
    usedDisc.add(d.holdId)
    usedConn.add(c.holdId)
    batch.push(
      newEvent({
        meterId: "",
        meterSerial: s,
        eventType: "restored",
        severity: "info",
        message: "Inbound TCP session replaced (same serial)",
        remoteHost: c.remoteHost,
        remotePort: c.remotePort,
        route: "inbound_tcp",
        dedupeKey: `listener:restored:${s}:${d.holdId}:${c.holdId}`,
        metadata: {
          previousHoldId: d.holdId,
          holdId: c.holdId,
        },
      })
    )
  }

  for (const d of disconnected) {
    if (usedDisc.has(d.holdId)) continue
    const serial = serialOf(d)
    batch.push(
      newEvent({
        meterId: "",
        meterSerial: serial,
        eventType: "disconnected",
        severity: "warning",
        message: serial
          ? "Inbound session closed"
          : "Unbound inbound session closed",
        remoteHost: d.remoteHost,
        remotePort: d.remotePort,
        route: "inbound_tcp",
        dedupeKey: `listener:disc:${d.holdId}`,
        metadata: {
          holdId: d.holdId,
          pendingBind: d.pendingBind,
          sessionState: d.sessionState,
        },
      })
    )
  }

  for (const c of connected) {
    if (usedConn.has(c.holdId)) continue
    const serial = serialOf(c)
    batch.push(
      newEvent({
        meterId: "",
        meterSerial: serial,
        eventType: "connected",
        severity: "info",
        message: serial
          ? "Inbound session accepted (bound)"
          : "Inbound session accepted (awaiting bind)",
        remoteHost: c.remoteHost,
        remotePort: c.remotePort,
        route: "inbound_tcp",
        dedupeKey: `listener:conn:${c.holdId}`,
        metadata: {
          holdId: c.holdId,
          pendingBind: c.pendingBind,
          sessionState: c.sessionState,
        },
      })
    )
  }

  for (const id of nextIds) {
    if (!prevIds.has(id)) continue
    const p = prev[id]!
    const n = next[id]!

    if (p.sessionState !== "identify_failed" && n.sessionState === "identify_failed") {
      const serial = serialOf(n) || serialOf(p)
      batch.push(
        newEvent({
          meterId: "",
          meterSerial: serial,
          eventType: "auto_bind_failed",
          severity: "error",
          message: n.identifyError?.trim()
            ? `Auto-identify / bind failed: ${n.identifyError.trim()}`
            : "Auto-identify / bind failed (inbound listener)",
          remoteHost: n.remoteHost,
          remotePort: n.remotePort,
          route: "inbound_tcp",
          dedupeKey: `listener:autobindfail:${n.holdId}`,
          metadata: {
            holdId: n.holdId,
            identifyError: n.identifyError ?? null,
            sessionState: n.sessionState,
          },
        })
      )
    }

    if (
      p.pendingBind === true &&
      n.pendingBind === false &&
      serialOf(n) &&
      p.holdId === n.holdId
    ) {
      const serial = serialOf(n)
      const auto = n.bindingSource === "auto"
      batch.push(
        newEvent({
          meterId: "",
          meterSerial: serial,
          eventType: auto ? "auto_bind_success" : "association_success",
          severity: "info",
          message: auto
            ? "Auto-bound inbound session to serial"
            : "Inbound session bound (operator / scanner)",
          remoteHost: n.remoteHost,
          remotePort: n.remotePort,
          route: "inbound_tcp",
          dedupeKey: `listener:bind:${n.holdId}`,
          metadata: {
            holdId: n.holdId,
            bindingSource: n.bindingSource ?? null,
          },
        })
      )
    }
  }

  await appendConnectivityEventsBatch(batch)

  await saveListenerSnapshot({ holds: next })
}
