"use client"

import { AlertCircleIcon, RefreshCwIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchTcpListenerStatus,
  getTcpListenerObisSelectionJobPoll,
  postReadObisSelectionDirect,
  postStartTcpListenerObisSelectionJob,
  postTcpListenerObisJobCancel,
  postTcpListenerObisJobSkipRow,
  postRelayDisconnectReadings,
  postRelayReadStatusReadings,
  postRelayReconnectReadings,
  READINGS_FETCH_NETWORK_ERROR,
  type TcpListenerStatus,
} from "@/lib/readings/api"
import {
  getCatalogRowsForPackFromRows,
  packKeysForCatalogRows,
} from "@/lib/obis/catalog-seed"
import {
  mergeObisJobPollIntoRowState,
  mergeObisSelectionIntoRowState,
  type ObisRowReadState,
} from "@/lib/obis/merge-read-results"
import { obisSelectionRowSupportedV1Catalog } from "@/lib/obis/obis-selection-v1-client"
import { packLabel, type ObisCatalogEntry } from "@/lib/obis/types"
import type { MeterListRow } from "@/types/meter"
import type {
  ObisSelectionItemInput,
  ObisSelectionJobPollView,
  ReadObisSelectionPayload,
  RelayControlPayload,
  RelayUiState,
  RuntimeResponseEnvelope,
} from "@/types/runtime"
import { cn } from "@/lib/utils"

const POLL_MS = 6000
const OBIS_JOB_POLL_MS = 280
const OBIS_JOB_MAX_MS = 46 * 60_000

type TransportMode = "inbound" | "direct"

function obisRowStatusBadgeVariant(
  st: ObisRowReadState["status"]
): "success" | "danger" | "neutral" | "warning" | "info" {
  switch (st) {
    case "ok":
      return "success"
    case "error":
      return "danger"
    case "running":
    case "pending":
      return "info"
    case "unsupported":
    case "not_attempted":
    case "skipped":
    case "cancelled":
      return "warning"
    default:
      return "neutral"
  }
}

function compactStatusLabel(st: ObisRowReadState["status"]): string {
  switch (st) {
    case "not_attempted":
      return "not attempted"
    case "skipped":
      return "skipped"
    case "cancelled":
      return "cancelled"
    case "unsupported":
      return "unsupported"
    case "pending":
      return "pending"
    case "running":
      return "running"
    case "ok":
      return "ok"
    case "error":
      return "error"
    default:
      return st
  }
}

function ObisErrorStatusHover({
  disabled,
  errorText,
  children,
}: {
  disabled: boolean
  errorText: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const anchorRef = useRef<HTMLSpanElement>(null)

  if (disabled) {
    return <span className="inline-flex">{children}</span>
  }

  return (
    <>
      <span
        ref={anchorRef}
        className="relative inline-flex cursor-help"
        onMouseEnter={() => {
          const el = anchorRef.current
          if (!el) return
          const r = el.getBoundingClientRect()
          setPos({ x: r.left, y: r.bottom + 6 })
          setOpen(true)
        }}
        onMouseLeave={() => setOpen(false)}
        title={errorText}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[300] max-w-sm rounded-md border border-border bg-popover px-2 py-1.5 text-left text-xs leading-snug whitespace-normal break-words text-popover-foreground shadow-md"
              style={{
                left: pos.x,
                top: pos.y,
                maxHeight: "min(40vh, 280px)",
                overflowY: "auto",
              }}
              role="tooltip"
            >
              {errorText}
            </div>,
            document.body
          )
        : null}
    </>
  )
}

function ObisRowStatusCell({ rs }: { rs: ObisRowReadState | undefined }) {
  if (!rs?.status) return "—"
  const label = compactStatusLabel(rs.status)
  const err = (rs.error ?? "").trim()
  const showHover = rs.status === "error" && err.length > 0

  return (
    <ObisErrorStatusHover disabled={!showHover} errorText={err}>
      <StatusBadge variant={obisRowStatusBadgeVariant(rs.status)}>{label}</StatusBadge>
    </ObisErrorStatusHover>
  )
}

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1
}

function catalogEntryToSelectionItem(r: ObisCatalogEntry): ObisSelectionItemInput {
  return {
    obis: r.obis,
    description: r.description,
    objectType: r.object_type,
    classId: r.class_id,
    attribute: r.attribute,
    scalerUnitAttribute: r.scaler_unit_attribute || undefined,
    unit: r.unit || undefined,
    packKey: r.pack_key,
  }
}

export function ReadingsWorkspaceClient() {
  const [catalog, setCatalog] = useState<ObisCatalogEntry[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [pack, setPack] = useState<string>("basic_setting")
  const [transport, setTransport] = useState<TransportMode>("inbound")
  const [meterId, setMeterId] = useState("")
  const [meters, setMeters] = useState<MeterListRow[]>([])
  const [metersError, setMetersError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [rowState, setRowState] = useState<Record<string, ObisRowReadState>>({})

  const [statusLoading, setStatusLoading] = useState(true)
  const [listenerStatus, setListenerStatus] = useState<TcpListenerStatus | null>(
    null
  )
  const [statusError, setStatusError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [relayBusy, setRelayBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [relayError, setRelayError] = useState<string | null>(null)
  const [relayState, setRelayState] = useState<RelayUiState>("unknown")
  const [lastRelayPayload, setLastRelayPayload] = useState<RelayControlPayload | null>(null)
  const [lastEnv, setLastEnv] = useState<RuntimeResponseEnvelope<
    ReadObisSelectionPayload
  > | null>(null)
  const [obisJobProgress, setObisJobProgress] = useState<string | null>(null)
  const [inboundObisJobId, setInboundObisJobId] = useState<string | null>(null)
  const [obisJobRowPhases, setObisJobRowPhases] = useState<Record<string, string>>({})
  const [obisJobCancelling, setObisJobCancelling] = useState(false)

  const packKeys = useMemo(() => packKeysForCatalogRows(catalog), [catalog])

  const catalogRows = useMemo(
    () => getCatalogRowsForPackFromRows(catalog, pack),
    [catalog, pack]
  )

  const v1SupportedRowsInPack = useMemo(
    () => catalogRows.filter((r) => r.enabled && obisSelectionRowSupportedV1Catalog(r)),
    [catalogRows]
  )

  useEffect(() => {
    setSelected(new Set())
  }, [pack])

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/obis-catalog", { signal: ac.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCatalog(data as ObisCatalogEntry[])
          setCatalogError(null)
        } else {
          setCatalog([])
          setCatalogError("OBIS catalog unavailable")
        }
      })
      .catch(() => {
        setCatalog([])
        setCatalogError("OBIS catalog load failed")
      })
    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (packKeys.length === 0) return
    if (!packKeys.includes(pack)) setPack(packKeys[0]!)
  }, [packKeys, pack])

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/meters", { signal: ac.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const rows = data as MeterListRow[]
          setMeters(rows)
          setMetersError(null)
          setMeterId((prev) => {
            if (prev && rows.some((m) => m.serialNumber === prev)) return prev
            return rows[0]?.serialNumber ?? ""
          })
        } else {
          setMeters([])
          setMetersError("Meters unavailable")
        }
      })
      .catch(() => {
        setMeters([])
        setMetersError("Meters load failed")
      })
    return () => ac.abort()
  }, [])

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setStatusError(null)
    const r = await fetchTcpListenerStatus(signal)
    if (!r.ok) {
      setListenerStatus(null)
      setStatusError(r.error)
      return
    }
    setListenerStatus(r.data)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    setStatusLoading(true)
    loadStatus(ac.signal).finally(() => {
      if (!ac.signal.aborted) setStatusLoading(false)
    })
    return () => ac.abort()
  }, [loadStatus])

  useEffect(() => {
    const id = window.setInterval(() => {
      loadStatus().catch(() => {})
    }, POLL_MS)
    return () => clearInterval(id)
  }, [loadStatus])

  const stagedPresent = listenerStatus ? boolish(listenerStatus.stagedPresent) : false
  const triggerInProgress = listenerStatus
    ? boolish(listenerStatus.sessionTriggerInProgress)
    : false
  const listening = listenerStatus ? boolish(listenerStatus.listening) : false
  const listenerEnabled = listenerStatus
    ? boolish(listenerStatus.listenerEnabled)
    : false

  const sessionLocked = busy || relayBusy

  const canInboundRead =
    transport === "inbound" &&
    stagedPresent &&
    !triggerInProgress &&
    !sessionLocked &&
    !statusLoading

  const canDirectRead = transport === "direct" && !sessionLocked
  const canRelayInbound =
    transport === "inbound" &&
    stagedPresent &&
    !triggerInProgress &&
    !sessionLocked &&
    !statusLoading &&
    listenerEnabled
  const canRelayDirect = transport === "direct" && !sessionLocked && Boolean(meterId.trim())
  const canRelayAction = canRelayInbound || canRelayDirect

  function toggleObis(obis: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(obis)) n.delete(obis)
      else n.add(obis)
      return n
    })
  }

  function selectAllInPack() {
    setSelected(new Set(catalogRows.filter((r) => r.enabled).map((r) => r.obis)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function executeReadObisSelection(items: ObisSelectionItemInput[]): Promise<void> {
    setActionError(null)
    if (items.length === 0) {
      setActionError("No OBIS rows to read.")
      return
    }

    const mid = meterId.trim() || "unknown-meter"
    const body = { meterId: mid, selectedItems: items }

    setBusy(true)
    setObisJobProgress(null)
    setInboundObisJobId(null)
    setObisJobRowPhases({})
    try {
      if (transport === "inbound") {
        const start = await postStartTcpListenerObisSelectionJob(body)
        if (!start.ok) {
          setActionError(start.error)
          return
        }
        const jobId = start.data.jobId
        setInboundObisJobId(jobId)
        const deadline = Date.now() + OBIS_JOB_MAX_MS
        let last: ObisSelectionJobPollView | null = null
        let pollAborted = false
        while (Date.now() < deadline) {
          const jr = await getTcpListenerObisSelectionJobPoll(jobId)
          if (!jr.ok) {
            setActionError(jr.error)
            pollAborted = true
            break
          }
          const snap = jr.data
          last = snap
          setObisJobRowPhases(
            Object.fromEntries(snap.rows.map((row) => [row.obis, row.phase]))
          )
          flushSync(() => {
            setRowState((p) => mergeObisJobPollIntoRowState(p, snap))
          })
          const wDone = snap.completedWire
          const wTot = snap.wireTotal
          const cur = snap.currentObis
          let line = `${wDone} / ${wTot} wire rows`
          if (cur) line += ` — running: ${cur}`
          if (snap.stale && snap.status === "running") {
            line += " (stale: job may be stuck)"
          }
          setObisJobProgress(line)
          if (
            snap.status === "completed" ||
            snap.status === "failed" ||
            snap.status === "cancelled"
          ) {
            if (snap.envelope) {
              setLastEnv(snap.envelope as RuntimeResponseEnvelope<ReadObisSelectionPayload>)
            }
            const okWire = snap.rows.filter((r) => r.row?.status === "ok").length
            if (snap.status === "cancelled") {
              setActionError(
                okWire > 0
                  ? `Stopped after ${okWire} ok row(s).`
                  : snap.envelope?.error?.message ??
                    snap.envelope?.message ??
                    "Stopped by operator."
              )
            } else if (snap.fatalError) {
              setActionError(
                okWire > 0
                  ? `Session ended after ${okWire} ok row(s). ${snap.fatalError}`
                  : snap.fatalError
              )
            } else if (snap.envelope && !snap.envelope.ok) {
              const msg =
                snap.envelope.error?.message ??
                snap.envelope.message ??
                "readObisSelection failed"
              setActionError(okWire > 0 ? `Session ended after ${okWire} ok row(s). ${msg}` : msg)
            } else {
              setActionError(null)
            }
            break
          }
          await new Promise((r) => setTimeout(r, OBIS_JOB_POLL_MS))
        }
        if (!pollAborted && last?.status === "running" && Date.now() >= deadline) {
          setActionError(
            "Timed out waiting for OBIS job (still running). Check listener / modem."
          )
        }
        return
      }

      const r = await postReadObisSelectionDirect(body)

      if (!r.ok) {
        setActionError(r.error)
        return
      }

      const env = r.data
      setLastEnv(env)

      const payload = env.payload
      if (payload && Array.isArray(payload.rows) && payload.rows.length > 0) {
        setRowState((p) => mergeObisSelectionIntoRowState(p, payload))
      }

      if (env.ok) {
        setActionError(null)
      } else {
        const msg = env.error?.message ?? env.message ?? "readObisSelection failed"
        setActionError(msg)
      }
    } finally {
      setBusy(false)
      setObisJobProgress(null)
      setInboundObisJobId(null)
      setObisJobRowPhases({})
      setObisJobCancelling(false)
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  async function onStopObisJob() {
    if (!inboundObisJobId) return
    setObisJobCancelling(true)
    try {
      const r = await postTcpListenerObisJobCancel(inboundObisJobId)
      if (!r.ok) setActionError(r.error)
    } finally {
      setObisJobCancelling(false)
    }
  }

  async function onSkipQueuedJobRow(obis: string) {
    const jid = inboundObisJobId
    if (!jid) return
    const jr = await getTcpListenerObisSelectionJobPoll(jid)
    if (!jr.ok) {
      setActionError(jr.error)
      return
    }
    const row = jr.data.rows.find((x) => x.obis === obis)
    if (!row || row.phase !== "queued") return
    const sk = await postTcpListenerObisJobSkipRow(jid, row.index)
    if (!sk.ok) setActionError(sk.error)
  }

  async function onReadSelected() {
    if (selected.size === 0) {
      setActionError("Select at least one OBIS row.")
      return
    }
    const rows = catalogRows.filter((r) => selected.has(r.obis))
    const items = rows.map(catalogEntryToSelectionItem)
    await executeReadObisSelection(items)
  }

  async function onReadCategory() {
    if (v1SupportedRowsInPack.length === 0) {
      setActionError("No v1-readable rows in this category (Data/Clock/Register, attr 2).")
      return
    }
    const items = v1SupportedRowsInPack.map(catalogEntryToSelectionItem)
    await executeReadObisSelection(items)
  }

  async function refreshRelayStatusAfterCommand() {
    const mid = meterId.trim() || "unknown-meter"
    const r = await postRelayReadStatusReadings(transport, mid)
    if (r.ok && r.data.payload?.relayState) {
      setRelayState(r.data.payload.relayState)
      setLastRelayPayload(r.data.payload)
    }
  }

  async function onRelayReadStatus() {
    setRelayError(null)
    const mid = meterId.trim() || "unknown-meter"
    setRelayBusy(true)
    try {
      const r = await postRelayReadStatusReadings(transport, mid)
      if (!r.ok) {
        setRelayError(r.error)
        return
      }
      const env = r.data
      const p = env.payload
      if (p?.relayState) setRelayState(p.relayState)
      setLastRelayPayload(p ?? null)
      if (!env.ok) {
        setRelayError(env.error?.message ?? env.message ?? "Relay status failed")
      }
    } finally {
      setRelayBusy(false)
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  async function onRelayOff() {
    setRelayError(null)
    const mid = meterId.trim() || "unknown-meter"
    setRelayBusy(true)
    try {
      const r = await postRelayDisconnectReadings(transport, mid)
      if (!r.ok) {
        setRelayError(r.error)
        return
      }
      const env = r.data
      setLastRelayPayload(env.payload ?? null)
      if (!env.ok) {
        setRelayError(env.error?.message ?? env.message ?? "Relay OFF failed")
        return
      }
      setRelayState("off")
      await refreshRelayStatusAfterCommand()
    } finally {
      setRelayBusy(false)
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  async function onRelayOn() {
    setRelayError(null)
    const mid = meterId.trim() || "unknown-meter"
    setRelayBusy(true)
    try {
      const r = await postRelayReconnectReadings(transport, mid)
      if (!r.ok) {
        setRelayError(r.error)
        return
      }
      const env = r.data
      setLastRelayPayload(env.payload ?? null)
      if (!env.ok) {
        setRelayError(env.error?.message ?? env.message ?? "Relay ON failed")
        return
      }
      setRelayState("on")
      await refreshRelayStatusAfterCommand()
    } finally {
      setRelayBusy(false)
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  const relayBadge =
    relayState === "on"
      ? { label: "ON", variant: "success" as const }
      : relayState === "off"
        ? { label: "OFF", variant: "neutral" as const }
        : { label: "Unknown", variant: "warning" as const }

  const triggerRecord =
    listenerStatus?.lastTcpListenerTrigger &&
    typeof listenerStatus.lastTcpListenerTrigger === "object"
      ? (listenerStatus.lastTcpListenerTrigger as Record<string, unknown>)
      : null

  const obisSummary =
    triggerRecord && triggerRecord.obisSelectionSummary &&
    typeof triggerRecord.obisSelectionSummary === "object"
      ? (triggerRecord.obisSelectionSummary as Record<string, unknown>)
      : null

  return (
    <div className="space-y-4">
      <PageHeader title="Readings" subtitle="Staged inbound or direct transport." />

      <div className="grid gap-4 lg:grid-cols-[minmax(200px,240px)_1fr] lg:items-start">
        <aside className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pack
          </p>
          <ul className="mt-2 space-y-0.5">
            {packKeys.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setPack(key)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-sm",
                    pack === key
                      ? "bg-primary/15 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {packLabel(key)}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs">
            <a href="/obis-config" className="text-muted-foreground underline underline-offset-2">
              Edit catalog
            </a>
          </p>
        </aside>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex min-w-[12rem] flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Meter (serial)</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={meters.some((m) => m.serialNumber === meterId) ? meterId : "__custom__"}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "__custom__") return
                  setMeterId(v)
                }}
              >
                <option value="__custom__">Other…</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.serialNumber}>
                    {m.serialNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Serial</span>
              <Input
                value={meterId}
                onChange={(e) => setMeterId(e.target.value)}
                className="h-9 font-mono text-sm"
                placeholder="Meter serial"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Transport</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={transport}
                onChange={(e) =>
                  setTransport(e.target.value === "direct" ? "direct" : "inbound")
                }
              >
                <option value="inbound">Inbound (staged)</option>
                <option value="direct">Direct</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <span className="font-medium text-muted-foreground">Relay</span>
            <StatusBadge variant={relayBadge.variant}>{relayBadge.label}</StatusBadge>
            <span className="font-mono text-[11px] text-muted-foreground">
              {meterId.trim() || "—"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!canRelayAction}
              onClick={() => void onRelayReadStatus()}
            >
              Read status
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={!canRelayAction}
              onClick={() => void onRelayOff()}
            >
              OFF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={!canRelayAction}
              onClick={() => void onRelayOn()}
            >
              ON
            </Button>
            {relayBusy ? (
              <span className="text-muted-foreground">Working…</span>
            ) : null}
            {lastRelayPayload?.logicalName ? (
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                {lastRelayPayload.logicalName}
              </span>
            ) : null}
          </div>
          {relayError ? (
            <p className="text-xs text-destructive">{relayError}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-xs">
            <span className="font-medium text-muted-foreground">Listener</span>
            {statusLoading ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : statusError ? (
              <span className="text-destructive">{statusError}</span>
            ) : listenerStatus ? (
              <>
                {listenerEnabled ? (
                  <StatusBadge variant="success">enabled</StatusBadge>
                ) : (
                  <StatusBadge variant="warning">disabled</StatusBadge>
                )}
                {listening ? (
                  <StatusBadge variant="success">listening</StatusBadge>
                ) : (
                  <StatusBadge variant="danger">not listening</StatusBadge>
                )}
                {stagedPresent ? (
                  <StatusBadge variant="success">staged</StatusBadge>
                ) : (
                  <StatusBadge variant="neutral">no socket</StatusBadge>
                )}
                {triggerInProgress ? (
                  <StatusBadge variant="info">trigger active</StatusBadge>
                ) : null}
                <span className="font-mono text-[11px]">
                  {String(listenerStatus.bindHost)}:{String(listenerStatus.bindPort)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    setStatusLoading(true)
                    loadStatus().finally(() => setStatusLoading(false))
                  }}
                >
                  <RefreshCwIcon className="size-3.5" />
                </Button>
              </>
            ) : null}
          </div>

          {triggerRecord ? (
            <p className="text-xs text-muted-foreground">
              Last trigger:{" "}
              <span className="font-mono">
                {String(triggerRecord.operation)} / ok={String(triggerRecord.ok)} /{" "}
                {String(triggerRecord.detailCode ?? "—")}
              </span>
              {obisSummary ? (
                <span className="ml-1 font-mono">
                  rows={String(obisSummary.rowCount ?? "—")} ok=
                  {String(obisSummary.okCount ?? "—")} unsupported=
                  {String(obisSummary.unsupportedCount ?? "—")} err=
                  {String(obisSummary.errorCount ?? "—")}
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={transport === "inbound" ? !canInboundRead : !canDirectRead}
              onClick={() => void onReadSelected()}
            >
              Read selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={transport === "inbound" ? !canInboundRead : !canDirectRead}
              onClick={() => void onReadCategory()}
            >
              Read category
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={selectAllInPack}>
              Select all in pack
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
              Clear selection
            </Button>
            {transport === "inbound" && busy && inboundObisJobId ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={obisJobCancelling}
                onClick={() => void onStopObisJob()}
              >
                {obisJobCancelling ? "Stopping…" : "Stop job"}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" disabled title="Planned">
              Export
            </Button>
          </div>

          {catalogError ? (
            <p className="text-xs text-destructive">{catalogError}</p>
          ) : null}
          {metersError ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{metersError}</p>
          ) : null}
          {actionError ? (
            <p className="text-xs text-destructive">{actionError}</p>
          ) : null}
          {busy ? (
            <p className="text-xs text-muted-foreground">
              {obisJobCancelling ? "Cancelling…" : "Working…"}
            </p>
          ) : null}
          {obisJobProgress ? (
            <p className="text-xs text-muted-foreground">{obisJobProgress}</p>
          ) : null}

          {lastEnv ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs whitespace-normal break-words">
              <span className="font-medium">Last envelope</span>{" "}
              <span className="font-mono">{lastEnv.operation}</span> ok=
              {String(lastEnv.ok)} simulated={String(lastEnv.simulated)} detail=
              {lastEnv.diagnostics?.detailCode ?? "—"} verifiedOnWire=
              {String(lastEnv.diagnostics?.verifiedOnWire ?? false)}
            </div>
          ) : null}

          <div className="max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={
                        catalogRows.length > 0 &&
                        catalogRows.every((r) => selected.has(r.obis))
                      }
                      onChange={(e) => {
                        if (e.target.checked) selectAllInPack()
                        else clearSelection()
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-8 p-1 text-center text-[10px] font-normal text-muted-foreground">
                    Q
                  </TableHead>
                  <TableHead className="whitespace-nowrap">OBIS</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="whitespace-nowrap">Pack</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogRows.map((r) => {
                  const rs = rowState[r.obis]
                  return (
                    <TableRow key={r.obis}>
                      <TableCell className="align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(r.obis)}
                          onChange={() => toggleObis(r.obis)}
                          aria-label={`Select ${r.obis}`}
                        />
                      </TableCell>
                      <TableCell className="p-1 align-top text-center">
                        {transport === "inbound" &&
                        busy &&
                        inboundObisJobId &&
                        obisJobRowPhases[r.obis] === "queued" ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${r.obis} from read queue`}
                            onClick={() => void onSkipQueuedJobRow(r.obis)}
                          >
                            <XIcon className="size-3.5" />
                          </Button>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[10rem] align-top font-mono text-xs whitespace-normal break-all">
                        {r.obis}
                      </TableCell>
                      <TableCell className="max-w-[min(16rem,32vw)] align-top text-xs whitespace-normal break-words">
                        {r.description}
                      </TableCell>
                      <TableCell className="max-w-[min(8rem,20vw)] align-top text-xs whitespace-normal break-words">
                        {packLabel(r.pack_key)}
                      </TableCell>
                      <TableCell className="max-w-[min(11rem,26vw)] align-top font-mono text-xs whitespace-normal break-words">
                        {rs?.result ?? ""}
                      </TableCell>
                      <TableCell className="w-[1%] align-top whitespace-nowrap text-xs">
                        <ObisRowStatusCell rs={rs} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {statusError && !listenerStatus ? (
            <EmptyState
              title="Listener status unavailable"
              description={
                statusError === READINGS_FETCH_NETWORK_ERROR
                  ? READINGS_FETCH_NETWORK_ERROR
                  : statusError
              }
              icon={<AlertCircleIcon className="size-5" aria-hidden />}
              className="border-dashed bg-muted/10"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
