"use client"

import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshCwIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"

import { MeterSearchCombobox } from "@/components/readings/meter-search-combobox"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
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
  tcpListenerStrictRouteAvailableForSerial,
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

/** Relay UI: only "confirmed" when diagnostics say verified on wire (not HTTP 200 alone). */
type RelayConfidence = "confirmed" | "unconfirmed" | "unknown"

function relayConfidenceFromEnvelope(
  env: RuntimeResponseEnvelope<unknown> | null | undefined
): RelayConfidence {
  if (!env?.ok) return "unknown"
  if (env.diagnostics?.verifiedOnWire) return "confirmed"
  return "unconfirmed"
}

type PerMeterReadingsState = {
  relayState: RelayUiState
  relayConfidence: RelayConfidence
  lastRelayPayload: RelayControlPayload | null
  relayError: string | null
  actionError: string | null
  lastEnv: RuntimeResponseEnvelope<ReadObisSelectionPayload> | null
  rowState: Record<string, ObisRowReadState>
  obisJobProgress: string | null
}

function emptyPerMeterState(): PerMeterReadingsState {
  return {
    relayState: "unknown",
    relayConfidence: "unknown",
    lastRelayPayload: null,
    relayError: null,
    actionError: null,
    lastEnv: null,
    rowState: {},
    obisJobProgress: null,
  }
}

type ActionLogEntry = {
  id: string
  ts: number
  level: "info" | "warn" | "error"
  serial: string
  tag: string
  summary: string
  detail?: string
}

/** Short operator-facing text; full strings stay in diagnostics. */
function compactSurfaceError(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  const u = t.toUpperCase()
  if (u.includes("NO_STAGED") || u.includes("NO STAGED")) return "No live session"
  if (u.includes("NOT ROUTED") || u.includes("NO ROUTE")) return "No live session"
  if (u.includes("DETAILCODE") || u.includes("DETAIL_CODE")) return "Read failed"
  if (u.includes("SESSION BUSY") || u.includes("409")) return "Session busy"
  if (t.length > 96) return `${t.slice(0, 93)}…`
  return t
}

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
  const rx = r as ObisCatalogEntry & {
    objectType?: string
    classId?: number
    packKey?: string
    scalerUnitAttribute?: number
  }
  const objectType =
    String(rx.objectType ?? r.object_type ?? "Data").trim() || "Data"
  const rawClass = rx.classId ?? r.class_id
  const classId =
    typeof rawClass === "number" && Number.isFinite(rawClass)
      ? Math.trunc(rawClass)
      : Math.trunc(Number(rawClass))
  const rawAttr = r.attribute
  const attribute =
    typeof rawAttr === "number" && Number.isFinite(rawAttr)
      ? Math.trunc(rawAttr)
      : undefined
  const rawSu = rx.scalerUnitAttribute ?? r.scaler_unit_attribute
  const scalerUnitAttribute =
    typeof rawSu === "number" && Number.isFinite(rawSu)
      ? Math.trunc(rawSu)
      : undefined
  const packKey = (rx.packKey ?? r.pack_key) || undefined
  return {
    obis: r.obis,
    description: r.description,
    objectType,
    classId: Number.isFinite(classId) ? classId : r.class_id,
    ...(attribute !== undefined ? { attribute } : {}),
    ...(scalerUnitAttribute !== undefined ? { scalerUnitAttribute } : {}),
    unit: r.unit || undefined,
    packKey,
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

  const [statusLoading, setStatusLoading] = useState(true)
  const [listenerStatus, setListenerStatus] = useState<TcpListenerStatus | null>(
    null
  )
  const [statusError, setStatusError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [relayBusy, setRelayBusy] = useState(false)
  const [perMeter, setPerMeter] = useState<Record<string, PerMeterReadingsState>>({})
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([])
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(() => new Set())
  const [inboundObisJobId, setInboundObisJobId] = useState<string | null>(null)
  const [obisJobRowPhases, setObisJobRowPhases] = useState<Record<string, string>>({})
  const [obisJobCancelling, setObisJobCancelling] = useState(false)

  const inFlightTargetRef = useRef<string>("")

  const meterKey = meterId.trim()
  const currentMeterState = useMemo(
    () => perMeter[meterKey] ?? emptyPerMeterState(),
    [perMeter, meterKey]
  )

  const patchMeter = useCallback((serial: string, patch: Partial<PerMeterReadingsState>) => {
    const k = serial.trim()
    if (!k) return
    setPerMeter((p) => {
      const cur = p[k] ?? emptyPerMeterState()
      return { ...p, [k]: { ...cur, ...patch } }
    })
  }, [])

  const patchMeterRowState = useCallback(
    (
      serial: string,
      updater: (prev: Record<string, ObisRowReadState>) => Record<string, ObisRowReadState>
    ) => {
      const k = serial.trim()
      if (!k) return
      setPerMeter((p) => {
        const cur = p[k] ?? emptyPerMeterState()
        return { ...p, [k]: { ...cur, rowState: updater(cur.rowState) } }
      })
    },
    []
  )

  const pushActionLog = useCallback((entry: Omit<ActionLogEntry, "id" | "ts">) => {
    const row: ActionLogEntry = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      ts: Date.now(),
      ...entry,
    }
    setActionLog((prev) => [row, ...prev].slice(0, 200))
  }, [])

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

  const inboundRouteOk = tcpListenerStrictRouteAvailableForSerial(
    listenerStatus,
    meterId
  )

  const liveRelayPathOk = useMemo(() => {
    if (transport === "direct") return Boolean(meterId.trim())
    if (statusLoading || statusError) return false
    if (!listenerEnabled || !listening || !stagedPresent) return false
    if (triggerInProgress) return false
    if (!meterId.trim()) return false
    return inboundRouteOk
  }, [
    transport,
    meterId,
    statusLoading,
    statusError,
    listenerEnabled,
    listening,
    stagedPresent,
    triggerInProgress,
    inboundRouteOk,
  ])

  const actionLocked = busy || relayBusy

  const canInboundRead =
    transport === "inbound" &&
    stagedPresent &&
    inboundRouteOk &&
    !triggerInProgress &&
    !actionLocked &&
    !statusLoading

  const canDirectRead = transport === "direct" && !actionLocked
  const canRelayInbound =
    transport === "inbound" &&
    stagedPresent &&
    inboundRouteOk &&
    !triggerInProgress &&
    !actionLocked &&
    !statusLoading &&
    listenerEnabled
  const canRelayDirect = transport === "direct" && !actionLocked && Boolean(meterId.trim())
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

  /**
   * One meter read (inbound job or direct). Does not toggle page `busy` — caller owns that.
   * Updates per-meter state, listener job UI, and action log for this serial only.
   */
  async function performObisRead(
    mid: string,
    items: ObisSelectionItemInput[]
  ): Promise<void> {
    patchMeter(mid, { actionError: null })
    patchMeter(mid, { obisJobProgress: null })
    setInboundObisJobId(null)
    setObisJobRowPhases({})
    let finalActionErr: string | null = null
    let readOk = false
    const body = { meterId: mid, selectedItems: items }
    try {
      if (transport === "inbound") {
        const start = await postStartTcpListenerObisSelectionJob(body)
        if (!start.ok) {
          finalActionErr = start.error
          patchMeter(mid, { actionError: start.error })
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
            finalActionErr = jr.error
            patchMeter(mid, { actionError: jr.error })
            pollAborted = true
            break
          }
          const snap = jr.data
          last = snap
          setObisJobRowPhases(
            Object.fromEntries(snap.rows.map((row) => [row.obis, row.phase]))
          )
          flushSync(() => {
            patchMeterRowState(mid, (p) => mergeObisJobPollIntoRowState(p, snap))
          })
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
          patchMeter(mid, { obisJobProgress: line })
          if (
            snap.status === "completed" ||
            snap.status === "failed" ||
            snap.status === "cancelled"
          ) {
            if (snap.envelope) {
              patchMeter(mid, {
                lastEnv: snap.envelope as RuntimeResponseEnvelope<ReadObisSelectionPayload>,
              })
            }
            const okWire = snap.rows.filter((r) => r.row?.status === "ok").length
            if (snap.status === "cancelled") {
              finalActionErr =
                okWire > 0
                  ? `Stopped after ${okWire} ok row(s).`
                  : snap.envelope?.error?.message ??
                    snap.envelope?.message ??
                    "Stopped by operator."
              patchMeter(mid, { actionError: finalActionErr })
            } else if (snap.fatalError) {
              finalActionErr =
                okWire > 0
                  ? `Session ended after ${okWire} ok row(s). ${snap.fatalError}`
                  : snap.fatalError
              patchMeter(mid, { actionError: finalActionErr })
            } else if (snap.envelope && !snap.envelope.ok) {
              const msg =
                snap.envelope.error?.message ??
                snap.envelope.message ??
                "readObisSelection failed"
              finalActionErr = okWire > 0 ? `Session ended after ${okWire} ok row(s). ${msg}` : msg
              patchMeter(mid, { actionError: finalActionErr })
            } else {
              finalActionErr = null
              patchMeter(mid, { actionError: null })
              readOk = true
            }
            break
          }
          await new Promise((r) => setTimeout(r, OBIS_JOB_POLL_MS))
        }
        if (!pollAborted && last?.status === "running" && Date.now() >= deadline) {
          finalActionErr =
            "Timed out waiting for OBIS job (still running). Check listener / modem."
          patchMeter(mid, { actionError: finalActionErr })
        }
        return
      }

      const r = await postReadObisSelectionDirect(body)

      if (!r.ok) {
        finalActionErr = r.error
        patchMeter(mid, { actionError: r.error })
        return
      }

      const env = r.data
      patchMeter(mid, { lastEnv: env })

      const payload = env.payload
      if (payload && Array.isArray(payload.rows) && payload.rows.length > 0) {
        patchMeterRowState(mid, (p) => mergeObisSelectionIntoRowState(p, payload))
      }

      if (env.ok) {
        finalActionErr = null
        patchMeter(mid, { actionError: null })
        readOk = true
      } else {
        const msg = env.error?.message ?? env.message ?? "readObisSelection failed"
        finalActionErr = msg
        patchMeter(mid, { actionError: msg })
      }
    } finally {
      patchMeter(mid, { obisJobProgress: null })
      setInboundObisJobId(null)
      setObisJobRowPhases({})
      setObisJobCancelling(false)
      if (transport === "inbound") {
        await loadStatus()
      }
      if (readOk && !finalActionErr) {
        pushActionLog({
          level: "info",
          serial: mid,
          tag: transport === "inbound" ? "read_obis_job" : "read_obis_direct",
          summary: `Read OK (${items.length} item(s))`,
        })
      } else if (finalActionErr) {
        pushActionLog({
          level: "error",
          serial: mid,
          tag: "read_obis",
          summary: "Read finished with error",
          detail: finalActionErr,
        })
      }
    }
  }

  async function executeReadObisSelection(items: ObisSelectionItemInput[]): Promise<void> {
    const mid = meterId.trim() || "unknown-meter"
    inFlightTargetRef.current = mid
    if (items.length === 0) {
      patchMeter(mid, { actionError: "No OBIS rows to read." })
      inFlightTargetRef.current = ""
      return
    }
    setBusy(true)
    try {
      await performObisRead(mid, items)
    } finally {
      setBusy(false)
      inFlightTargetRef.current = ""
    }
  }

  async function onStopObisJob() {
    if (!inboundObisJobId) return
    const mid = meterId.trim() || "unknown-meter"
    setObisJobCancelling(true)
    try {
      const r = await postTcpListenerObisJobCancel(inboundObisJobId)
      if (!r.ok) patchMeter(mid, { actionError: r.error })
    } finally {
      setObisJobCancelling(false)
    }
  }

  async function onSkipQueuedJobRow(obis: string) {
    const jid = inboundObisJobId
    if (!jid) return
    const mid = meterId.trim() || "unknown-meter"
    const jr = await getTcpListenerObisSelectionJobPoll(jid)
    if (!jr.ok) {
      patchMeter(mid, { actionError: jr.error })
      return
    }
    const row = jr.data.rows.find((x) => x.obis === obis)
    if (!row || row.phase !== "queued") return
    const sk = await postTcpListenerObisJobSkipRow(jid, row.index)
    if (!sk.ok) patchMeter(mid, { actionError: sk.error })
  }

  async function onReadSelected() {
    const mid = meterId.trim() || "unknown-meter"
    if (selected.size === 0) {
      patchMeter(mid, { actionError: "Select at least one OBIS row." })
      return
    }
    const rows = catalogRows.filter((r) => selected.has(r.obis))
    const items = rows.map(catalogEntryToSelectionItem)
    await executeReadObisSelection(items)
  }

  async function onReadCategory() {
    const mid = meterId.trim() || "unknown-meter"
    if (v1SupportedRowsInPack.length === 0) {
      patchMeter(mid, {
        actionError: "No v1-readable rows in this category (Data/Clock/Register, attr 2).",
      })
      return
    }
    const items = v1SupportedRowsInPack.map(catalogEntryToSelectionItem)
    await executeReadObisSelection(items)
  }

  async function onRelayReadStatus() {
    const mid = meterId.trim() || "unknown-meter"
    inFlightTargetRef.current = mid
    patchMeter(mid, { relayError: null })
    setRelayBusy(true)
    try {
      const r = await postRelayReadStatusReadings(transport, mid)
      if (!r.ok) {
        patchMeter(mid, { relayError: r.error })
        pushActionLog({
          level: "error",
          serial: mid,
          tag: "relay_status",
          summary: "Read status failed",
          detail: r.error,
        })
        return
      }
      const env = r.data
      const p = env.payload
      patchMeter(mid, {
        relayConfidence: relayConfidenceFromEnvelope(env),
        ...(p?.relayState ? { relayState: p.relayState } : {}),
        lastRelayPayload: p ?? null,
        ...(!env.ok
          ? {
              relayError: env.error?.message ?? env.message ?? "Relay status failed",
            }
          : { relayError: null }),
      })
      if (env.ok) {
        pushActionLog({
          level: "info",
          serial: mid,
          tag: "relay_status",
          summary: `Relay ${p?.relayState ?? "unknown"}`,
        })
      } else {
        pushActionLog({
          level: "warn",
          serial: mid,
          tag: "relay_status",
          summary: "Relay status incomplete",
          detail: env.error?.message ?? env.message,
        })
      }
    } finally {
      setRelayBusy(false)
      inFlightTargetRef.current = ""
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  async function onRelayOff() {
    const mid = meterId.trim() || "unknown-meter"
    inFlightTargetRef.current = mid
    patchMeter(mid, { relayError: null })
    setRelayBusy(true)
    try {
      const r = await postRelayDisconnectReadings(transport, mid)
      if (!r.ok) {
        patchMeter(mid, { relayError: r.error })
        pushActionLog({
          level: "error",
          serial: mid,
          tag: "relay_off",
          summary: "OFF request failed",
          detail: r.error,
        })
        return
      }
      const env = r.data
      patchMeter(mid, { lastRelayPayload: env.payload ?? null })
      if (!env.ok) {
        const msg = env.error?.message ?? env.message ?? "Relay OFF failed"
        patchMeter(mid, { relayError: msg })
        pushActionLog({
          level: "error",
          serial: mid,
          tag: "relay_off",
          summary: "OFF failed",
          detail: msg,
        })
        return
      }
      if (env.payload?.relayState) {
        patchMeter(mid, {
          relayState: env.payload.relayState,
          relayConfidence: relayConfidenceFromEnvelope(env),
        })
      }
      const conf = relayConfidenceFromEnvelope(env)
      pushActionLog({
        level: conf === "confirmed" ? "info" : "warn",
        serial: mid,
        tag: "relay_off",
        summary:
          conf === "confirmed"
            ? `OFF confirmed (${env.payload?.relayState ?? "?"})`
            : `OFF unconfirmed (${env.payload?.relayState ?? "?"})`,
        detail: env.diagnostics?.detailCode,
      })
    } finally {
      setRelayBusy(false)
      inFlightTargetRef.current = ""
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  async function onRelayOn() {
    const mid = meterId.trim() || "unknown-meter"
    inFlightTargetRef.current = mid
    patchMeter(mid, { relayError: null })
    setRelayBusy(true)
    try {
      const r = await postRelayReconnectReadings(transport, mid)
      if (!r.ok) {
        patchMeter(mid, { relayError: r.error })
        pushActionLog({
          level: "error",
          serial: mid,
          tag: "relay_on",
          summary: "ON request failed",
          detail: r.error,
        })
        return
      }
      const env = r.data
      patchMeter(mid, { lastRelayPayload: env.payload ?? null })
      if (!env.ok) {
        const msg = env.error?.message ?? env.message ?? "Relay ON failed"
        patchMeter(mid, { relayError: msg })
        pushActionLog({
          level: "error",
          serial: mid,
          tag: "relay_on",
          summary: "ON failed",
          detail: msg,
        })
        return
      }
      if (env.payload?.relayState) {
        patchMeter(mid, {
          relayState: env.payload.relayState,
          relayConfidence: relayConfidenceFromEnvelope(env),
        })
      }
      const conf = relayConfidenceFromEnvelope(env)
      pushActionLog({
        level: conf === "confirmed" ? "info" : "warn",
        serial: mid,
        tag: "relay_on",
        summary:
          conf === "confirmed"
            ? `ON confirmed (${env.payload?.relayState ?? "?"})`
            : `ON unconfirmed (${env.payload?.relayState ?? "?"})`,
        detail: env.diagnostics?.detailCode,
      })
    } finally {
      setRelayBusy(false)
      inFlightTargetRef.current = ""
      if (transport === "inbound") {
        await loadStatus()
      }
    }
  }

  const relayState = currentMeterState.relayState
  const relayConfidence = currentMeterState.relayConfidence
  const lastRelayPayload = currentMeterState.lastRelayPayload

  const relayBadge = (() => {
    if (relayState === "unknown") {
      return { label: "Unknown", variant: "warning" as const }
    }
    if (liveRelayPathOk) {
      if (relayConfidence === "confirmed") {
        return relayState === "on"
          ? { label: "ON", variant: "success" as const }
          : { label: "OFF", variant: "neutral" as const }
      }
      return relayState === "on"
        ? { label: "ON?", variant: "warning" as const }
        : { label: "OFF?", variant: "warning" as const }
    }
    if (relayConfidence === "confirmed") {
      return relayState === "on"
        ? { label: "Last known ON", variant: "neutral" as const }
        : { label: "Last known OFF", variant: "neutral" as const }
    }
    return relayState === "on"
      ? { label: "Last known ON?", variant: "warning" as const }
      : { label: "Last known OFF?", variant: "warning" as const }
  })()

  const relayDiagHint =
    lastRelayPayload?.relayDiagnostics &&
    typeof lastRelayPayload.relayDiagnostics === "object"
      ? (() => {
          const d = lastRelayPayload.relayDiagnostics as Record<string, unknown>
          const rule = typeof d.interpretationRule === "string" ? d.interpretationRule : ""
          const prof = lastRelayPayload.relayProfileId
          const cmdProf = lastRelayPayload.relayCommandProfileId
          const fm =
            typeof d.relayReadbackAnalysis === "object" &&
            d.relayReadbackAnalysis !== null &&
            "failureMode" in d.relayReadbackAnalysis
              ? String(
                  (d.relayReadbackAnalysis as Record<string, unknown>).failureMode ?? ""
                )
              : ""
          const bits = [
            prof ? `stateProfile=${prof}` : "",
            cmdProf ? `cmdProfile=${cmdProf}` : "",
            rule ? `rule=${rule}` : "",
            fm ? `readback=${fm}` : "",
          ].filter(Boolean)
          return bits.length ? ` ${bits.join(" ")}` : ""
        })()
      : ""

  const relayBadgeTitle = liveRelayPathOk
    ? relayConfidence === "confirmed"
      ? "Relay verified on wire for this meter (live path)."
      : relayConfidence === "unconfirmed"
        ? "Not fully confirmed on the live path — use Read status."
        : "Relay unknown on the live path — use Read status."
    : relayConfidence === "confirmed"
      ? "Last verified on-wire state; no live session for this meter now — connect or route, then Read status."
      : relayConfidence === "unconfirmed"
        ? "Last response may be stale; no live session for this meter."
        : "Relay unknown — no live session for this meter."

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

  const connectionChip = useMemo(() => {
    if (actionLocked) {
      return { label: "Busy", variant: "info" as const }
    }
    if (transport === "direct") {
      return { label: "Direct", variant: "neutral" as const }
    }
    if (statusLoading) {
      return { label: "…", variant: "neutral" as const }
    }
    if (statusError) {
      return { label: "Listener fault", variant: "danger" as const }
    }
    if (!listenerEnabled) {
      return { label: "Listener off", variant: "warning" as const }
    }
    if (!listening) {
      return { label: "Offline", variant: "danger" as const }
    }
    if (!stagedPresent) {
      return { label: "No live session", variant: "warning" as const }
    }
    if (meterId.trim() && !inboundRouteOk) {
      return { label: "No live session", variant: "warning" as const }
    }
    if (triggerInProgress) {
      return { label: "Session busy", variant: "info" as const }
    }
    return { label: "Online", variant: "success" as const }
  }, [
    actionLocked,
    transport,
    statusLoading,
    statusError,
    listenerEnabled,
    listening,
    stagedPresent,
    meterId,
    inboundRouteOk,
    triggerInProgress,
  ])

  const surfaceActionErr = currentMeterState.actionError
    ? compactSurfaceError(currentMeterState.actionError)
    : ""
  const surfaceRelayErr = currentMeterState.relayError
    ? compactSurfaceError(currentMeterState.relayError)
    : ""

  const meterPickerLocked = actionLocked
  const transportLocked = actionLocked
  const lastEnv = currentMeterState.lastEnv
  const obisJobProgress = currentMeterState.obisJobProgress

  function toggleLogExpanded(id: string) {
    setExpandedLogIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Readings"
        subtitle="Operator console: one meter, OBIS reads, relay — details in Diagnostics."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Meter</p>
          <MeterSearchCombobox
            meters={meters}
            value={meterId}
            onChange={setMeterId}
            disabled={meterPickerLocked}
          />
        </div>
        <div className="flex shrink-0 items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Transport
            </span>
            <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
              <button
                type="button"
                disabled={transportLocked}
                onClick={() => setTransport("inbound")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  transport === "inbound"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  transportLocked && "opacity-60"
                )}
              >
                Inbound
              </button>
              <button
                type="button"
                disabled={transportLocked}
                onClick={() => setTransport("direct")}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  transport === "direct"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  transportLocked && "opacity-60"
                )}
              >
                Direct
              </button>
            </div>
          </div>
        </div>
      </div>

      {meterPickerLocked ? (
        <p className="text-xs text-muted-foreground">
          Executing on{" "}
          <span className="font-mono text-foreground">
            {inFlightTargetRef.current || meterId.trim() || "—"}
          </span>
          …
        </p>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge variant={connectionChip.variant}>{connectionChip.label}</StatusBadge>
          <span title={relayBadgeTitle}>
            <StatusBadge variant={relayBadge.variant}>Relay {relayBadge.label}</StatusBadge>
          </span>
          {relayBusy ? (
            <StatusBadge variant="info">Relay…</StatusBadge>
          ) : null}
          {busy ? (
            <StatusBadge variant="info">{obisJobCancelling ? "Stopping…" : "Reading…"}</StatusBadge>
          ) : null}
          {(surfaceActionErr || surfaceRelayErr) && !actionLocked ? (
            <StatusBadge variant="danger">Last action failed</StatusBadge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
          {transport === "inbound" && busy && inboundObisJobId ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-8"
              disabled={obisJobCancelling}
              onClick={() => void onStopObisJob()}
            >
              {obisJobCancelling ? "Stopping…" : "Stop job"}
            </Button>
          ) : null}
        </div>
      </div>

      {(surfaceActionErr || surfaceRelayErr) && !actionLocked ? (
        <div className="flex flex-wrap gap-2 text-xs text-destructive">
          {surfaceActionErr ? (
            <span className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1">
              {surfaceActionErr}
            </span>
          ) : null}
          {surfaceRelayErr ? (
            <span className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1">
              {surfaceRelayErr}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            OBIS pack
          </p>
          <a
            href="/obis-config"
            className="text-[10px] text-muted-foreground underline underline-offset-2"
          >
            Edit catalog
          </a>
        </div>
        <div className="flex flex-wrap gap-1">
          {packKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPack(key)}
              className={cn(
                "rounded-md px-2 py-1 text-xs",
                pack === key
                  ? "bg-primary/15 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              {packLabel(key)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={selectAllInPack}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={clearSelection}>
            Clear
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" disabled title="Planned">
            Export
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-muted-foreground"
          onClick={() => {
            setStatusLoading(true)
            loadStatus().finally(() => setStatusLoading(false))
          }}
        >
          <RefreshCwIcon className="size-3.5" />
          Refresh listener
        </Button>
      </div>

      {catalogError ? (
        <p className="text-xs text-destructive">{catalogError}</p>
      ) : null}
      {metersError ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{metersError}</p>
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
                  const rs = currentMeterState.rowState[r.obis]
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

      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
          onClick={() => setDiagnosticsOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-muted-foreground" aria-hidden />
            {"Diagnostics & action log"}
            {diagnosticsOpen ? (
              <ChevronUpIcon className="size-4 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden />
            )}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Listener, envelopes, raw errors, timestamps
          </span>
        </button>
        {diagnosticsOpen ? (
          <div className="space-y-3 border-t border-border px-3 py-3 font-mono text-[11px] leading-relaxed">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setActionLog([])}
              >
                Clear log
              </Button>
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Action log
              </p>
              {actionLog.length === 0 ? (
                <p className="text-muted-foreground">No entries yet.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-auto rounded border border-border bg-muted/20 p-2">
                  {actionLog.map((line) => (
                    <li key={line.id} className="border-b border-border/60 pb-1 last:border-0">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => toggleLogExpanded(line.id)}
                      >
                        <span className="text-muted-foreground">
                          {new Date(line.ts).toISOString()}
                        </span>{" "}
                        <span
                          className={
                            line.level === "error"
                              ? "text-destructive"
                              : line.level === "warn"
                                ? "text-amber-600 dark:text-amber-400"
                                : ""
                          }
                        >
                          [{line.level}]
                        </span>{" "}
                        <span className="text-foreground">{line.serial}</span>{" "}
                        <span className="text-muted-foreground">{line.tag}</span> — {line.summary}
                        {line.detail ? (
                          <span className="text-muted-foreground">
                            {" "}
                            {expandedLogIds.has(line.id) ? "▼" : "▶"}
                          </span>
                        ) : null}
                      </button>
                      {line.detail && expandedLogIds.has(line.id) ? (
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-background/80 p-2 text-[10px]">
                          {line.detail}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Listener / session
              </p>
              {statusLoading ? (
                <p>Loading…</p>
              ) : statusError ? (
                <p className="text-destructive">{statusError}</p>
              ) : listenerStatus ? (
                <div className="space-y-1 whitespace-pre-wrap break-words">
                  <p>
                    enabled={String(listenerEnabled)} listening={String(listening)} staged=
                    {String(stagedPresent)} triggerInProgress={String(triggerInProgress)}
                  </p>
                  <p>
                    bind {String(listenerStatus.bindHost)}:{String(listenerStatus.bindPort)}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">No status payload.</p>
              )}
            </div>

            {triggerRecord ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Last trigger
                </p>
                <p>
                  operation={String(triggerRecord.operation)} ok={String(triggerRecord.ok)} detailCode=
                  {String(triggerRecord.detailCode ?? "—")}
                </p>
                {obisSummary ? (
                  <p>
                    rows={String(obisSummary.rowCount ?? "—")} ok={String(obisSummary.okCount ?? "—")}{" "}
                    unsupported={String(obisSummary.unsupportedCount ?? "—")} err=
                    {String(obisSummary.errorCount ?? "—")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {lastEnv ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Last envelope (this meter)
                </p>
                <p>
                  {lastEnv.operation} ok={String(lastEnv.ok)} simulated={String(lastEnv.simulated)} detail=
                  {lastEnv.diagnostics?.detailCode ?? "—"} verifiedOnWire=
                  {String(lastEnv.diagnostics?.verifiedOnWire ?? false)}
                </p>
              </div>
            ) : null}

            {currentMeterState.actionError ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Last read / job error (full)
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/20 p-2">
                  {currentMeterState.actionError}
                </pre>
              </div>
            ) : null}

            {currentMeterState.relayError ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Last relay error (full)
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/20 p-2">
                  {currentMeterState.relayError}
                </pre>
              </div>
            ) : null}

            {obisJobProgress ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  OBIS job progress (last)
                </p>
                <p>{obisJobProgress}</p>
              </div>
            ) : null}

            {relayDiagHint.trim() ||
            (lastRelayPayload?.relayDiagnostics &&
              typeof lastRelayPayload.relayDiagnostics === "object") ? (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Relay interpretation (technical)
                </p>
                {relayDiagHint.trim() ? (
                  <p className="mb-2 break-words">{relayDiagHint.trim()}</p>
                ) : null}
                {lastRelayPayload?.relayDiagnostics &&
                typeof lastRelayPayload.relayDiagnostics === "object" ? (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/20 p-2 text-[10px]">
                    {JSON.stringify(lastRelayPayload.relayDiagnostics, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {lastRelayPayload?.logicalName ? (
              <p>logicalName={String(lastRelayPayload.logicalName)}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
