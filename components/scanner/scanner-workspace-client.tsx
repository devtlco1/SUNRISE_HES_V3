"use client"

import { RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

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
  postTcpListenerReadIdentity,
  READINGS_FETCH_NETWORK_ERROR,
  type TcpListenerStatus,
} from "@/lib/readings/api"
import { serialAlreadyRegistered } from "@/lib/meters/create-from-serial"
import type { MeterListRow } from "@/types/meter"

const POLL_MS = 4000

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1
}

type ParsedStagedSession = {
  pendingBind: boolean
  canonicalSerial?: string
  remoteHost: string
  remotePort: number
  acceptedAtUtc: string
  sessionState?: string
  operatorLabel?: string
  identifyError?: string
}

function parseStagedSessions(status: TcpListenerStatus | null): ParsedStagedSession[] {
  const raw = status?.stagedSessions
  if (!Array.isArray(raw)) return []
  const out: ParsedStagedSession[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const rh = o.remoteHost
    const rp = o.remotePort
    const at = o.acceptedAtUtc
    if (typeof rh !== "string" || typeof at !== "string") continue
    if (typeof rp !== "number") continue
    const pending = o.pendingBind === true
    const cs = typeof o.canonicalSerial === "string" ? o.canonicalSerial : undefined
    const sessionState = typeof o.sessionState === "string" ? o.sessionState : undefined
    const operatorLabel = typeof o.operatorLabel === "string" ? o.operatorLabel : undefined
    const identifyError = typeof o.identifyError === "string" ? o.identifyError : undefined
    out.push({
      pendingBind: pending,
      canonicalSerial: cs,
      remoteHost: rh,
      remotePort: rp,
      acceptedAtUtc: at,
      sessionState,
      operatorLabel,
      identifyError,
    })
  }
  return out
}

export function ScannerWorkspaceClient() {
  const [statusLoading, setStatusLoading] = useState(true)
  const [listenerStatus, setListenerStatus] = useState<TcpListenerStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [meters, setMeters] = useState<MeterListRow[]>([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [identifyState, setIdentifyState] = useState<"idle" | "ok" | "error">("idle")
  const [lastIdentifyAux, setLastIdentifyAux] = useState<string | null>(null)

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

  const reloadMeters = useCallback(async () => {
    try {
      const r = await fetch("/api/meters", { cache: "no-store" })
      const data = await r.json()
      if (Array.isArray(data)) setMeters(data as MeterListRow[])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    reloadMeters()
  }, [reloadMeters])

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
    return () => window.clearInterval(id)
  }, [loadStatus])

  const triggerInProgress = listenerStatus
    ? boolish(listenerStatus.sessionTriggerInProgress)
    : false
  const listening = listenerStatus ? boolish(listenerStatus.listening) : false
  const listenerEnabled = listenerStatus ? boolish(listenerStatus.listenerEnabled) : false

  const sessionRows = useMemo(
    () => parseStagedSessions(listenerStatus),
    [listenerStatus]
  )

  const routableUnbound =
    typeof listenerStatus?.routableUnboundCount === "number"
      ? listenerStatus.routableUnboundCount
      : sessionRows.filter((r) => r.pendingBind && r.sessionState === "identify_failed").length

  const awaitingAuto =
    typeof listenerStatus?.awaitingAutoIdentifyCount === "number"
      ? listenerStatus.awaitingAutoIdentifyCount
      : sessionRows.filter((r) => r.pendingBind && r.sessionState === "awaiting_auto_identify").length

  const sessionsKey = useMemo(() => JSON.stringify(sessionRows), [sessionRows])

  useEffect(() => {
    setIdentifyState("idle")
    setLastIdentifyAux(null)
    setActionError(null)
  }, [sessionsKey])

  async function onIdentify() {
    setActionError(null)
    if (routableUnbound <= 0 || triggerInProgress) {
      setActionError(
        awaitingAuto > 0
          ? "Auto-identify is running — no manual recovery needed yet."
          : "No failed session needs Scanner recovery."
      )
      return
    }
    setBusy(true)
    setIdentifyState("idle")
    try {
      const r = await postTcpListenerReadIdentity("inbound-scanner")
      if (!r.ok) {
        setIdentifyState("error")
        setActionError(r.error)
        return
      }
      const p = r.data.payload
      const aux = (p?.logicalDeviceName ?? "").trim()
      setLastIdentifyAux(aux || null)
      const canonical = (p?.serialNumber ?? "").trim()
      if (!canonical) {
        setIdentifyState("error")
        setActionError(
          "Canonical serial (0.0.96.1.0.255) not read — auxiliary fields cannot substitute."
        )
        return
      }
      setIdentifyState("ok")
      await reloadMeters()
    } finally {
      setBusy(false)
      await loadStatus()
    }
  }

  async function onAddSerial(serial: string) {
    const s = serial.trim()
    if (!s) return
    setActionError(null)
    setBusy(true)
    try {
      const res = await fetch("/api/meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: s }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data === "object" && data && "error" in data
            ? String((data as { error: string }).error)
            : `HTTP ${res.status}`
        setActionError(msg)
        return
      }
      await reloadMeters()
    } finally {
      setBusy(false)
    }
  }

  const triggerRecord =
    listenerStatus?.lastTcpListenerTrigger &&
    typeof listenerStatus.lastTcpListenerTrigger === "object"
      ? (listenerStatus.lastTcpListenerTrigger as Record<string, unknown>)
      : null

  const canManualIdentify =
    routableUnbound > 0 &&
    !triggerInProgress &&
    !busy &&
    !statusLoading &&
    listenerEnabled

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scanner"
        subtitle="Monitor inbound sessions; manual identify only when auto-identify failed."
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Listener</span>
        {statusLoading ? (
          <span className="text-muted-foreground">…</span>
        ) : statusError ? (
          <span className="text-destructive">
            {statusError === READINGS_FETCH_NETWORK_ERROR ? "Status unreachable" : statusError}
          </span>
        ) : listenerStatus ? (
          <>
            <StatusBadge variant={listenerEnabled ? "success" : "warning"}>
              {listenerEnabled ? "on" : "off"}
            </StatusBadge>
            <StatusBadge variant={listening ? "success" : "danger"}>
              {listening ? "listen" : "down"}
            </StatusBadge>
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
        <p className="font-mono text-[11px] text-muted-foreground">
          Last: {String(triggerRecord.operation)} ok={String(triggerRecord.ok)}{" "}
          {String(triggerRecord.detailCode ?? "")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canManualIdentify}
          onClick={() => void onIdentify()}
        >
          Manual identify (recovery)
        </Button>
        {awaitingAuto > 0 ? (
          <span className="text-xs text-muted-foreground">
            Auto-identifying… ({awaitingAuto})
          </span>
        ) : null}
        {identifyState === "error" ? (
          <span className="text-xs text-destructive">Identify failed</span>
        ) : identifyState === "ok" ? (
          <span className="text-xs text-muted-foreground">Manual bind OK</span>
        ) : null}
        {lastIdentifyAux ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            Aux 0.0.96.1.1.255: {lastIdentifyAux}
          </span>
        ) : null}
      </div>

      {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}

      <div className="overflow-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Remote</TableHead>
              <TableHead>Since</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Serial (0.0.96.1.0.255)</TableHead>
              <TableHead>Registry</TableHead>
              <TableHead className="text-right">Add</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessionRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-xs text-muted-foreground"
                >
                  No inbound connections.
                </TableCell>
              </TableRow>
            ) : (
              sessionRows.map((row, i) => {
                const ep = `${row.remoteHost}:${row.remotePort}`
                const serial = row.pendingBind
                  ? null
                  : (row.canonicalSerial ?? "").trim() || null
                const reg = serial
                  ? serialAlreadyRegistered(serial, meters)
                  : null
                return (
                  <TableRow key={`${ep}|${row.acceptedAtUtc}|${i}`}>
                    <TableCell className="max-w-[min(12rem,28vw)] align-top font-mono text-xs whitespace-normal break-all">
                      {ep}
                    </TableCell>
                    <TableCell className="max-w-[min(10rem,24vw)] align-top font-mono text-[10px] whitespace-normal break-words text-muted-foreground">
                      {row.acceptedAtUtc}
                    </TableCell>
                    <TableCell className="max-w-[min(11rem,26vw)] align-top text-xs">
                      <div className="font-medium">{row.operatorLabel ?? "—"}</div>
                      {row.identifyError ? (
                        <div className="mt-0.5 font-mono text-[10px] text-destructive break-words line-clamp-2">
                          {row.identifyError}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[min(14rem,32vw)] align-top font-mono text-xs whitespace-normal break-words">
                      {serial ?? "—"}
                    </TableCell>
                    <TableCell>
                      {!serial ? (
                        "—"
                      ) : reg ? (
                        <StatusBadge variant="success">Registered</StatusBadge>
                      ) : (
                        <StatusBadge variant="warning">Not registered</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!serial || !!reg || busy}
                        onClick={() => void onAddSerial(serial!)}
                      >
                        Add
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
