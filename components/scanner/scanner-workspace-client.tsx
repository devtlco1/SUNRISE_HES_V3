"use client"

import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

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
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
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

function formatListenerMode(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "—"
  return raw.trim().replace(/_/g, " ")
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
  const [identifyInFlight, setIdentifyInFlight] = useState(false)
  const [addInFlight, setAddInFlight] = useState(false)
  const [refreshBusy, setRefreshBusy] = useState(false)
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
    setIdentifyInFlight(true)
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
      setIdentifyInFlight(false)
      await loadStatus()
    }
  }

  async function onAddSerial(serial: string) {
    const s = serial.trim()
    if (!s) return
    setActionError(null)
    setAddInFlight(true)
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
      setAddInFlight(false)
    }
  }

  async function onRefreshStatus() {
    setRefreshBusy(true)
    try {
      await loadStatus()
    } finally {
      setRefreshBusy(false)
    }
  }

  const tcpActionBusy = identifyInFlight || addInFlight

  const canManualIdentify =
    routableUnbound > 0 &&
    !triggerInProgress &&
    !tcpActionBusy &&
    listenerEnabled &&
    listening &&
    Boolean(listenerStatus) &&
    !statusError

  const bindHost =
    listenerStatus && typeof listenerStatus.bindHost === "string"
      ? listenerStatus.bindHost
      : "—"
  const bindPort =
    listenerStatus && typeof listenerStatus.bindPort === "number"
      ? listenerStatus.bindPort
      : "—"
  const bindEp = `${bindHost}:${bindPort}`

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {statusLoading ? (
              <StatusBadge variant="neutral">…</StatusBadge>
            ) : statusError ? (
              <span className="text-xs text-destructive">
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
                <span className="text-[11px] text-muted-foreground">
                  {formatListenerMode(listenerStatus.listenerMode)}
                </span>
                <span className="font-mono text-[11px] text-foreground">{bindEp}</span>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-muted-foreground"
              disabled={statusLoading || refreshBusy}
              onClick={() => void onRefreshStatus()}
              aria-label="Refresh listener status"
            >
              {refreshBusy ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCwIcon className="size-3.5" aria-hidden />
              )}
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={!canManualIdentify || identifyInFlight}
            onClick={() => void onIdentify()}
          >
            {identifyInFlight ? (
              <Loader2Icon className="mr-1 size-3.5 animate-spin" aria-hidden />
            ) : null}
            Manual identify
          </Button>
        </div>

        {awaitingAuto > 0 ? (
          <p className="text-xs text-muted-foreground">
            Auto-identifying… ({awaitingAuto})
          </p>
        ) : null}
        {identifyState === "error" ? (
          <p className="text-xs text-destructive">Identify failed</p>
        ) : identifyState === "ok" ? (
          <p className="text-xs text-muted-foreground">Manual bind OK</p>
        ) : null}
        {lastIdentifyAux ? (
          <p className="font-mono text-[10px] text-muted-foreground">
            Aux 0.0.96.1.1.255: {lastIdentifyAux}
          </p>
        ) : null}
        {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
      </div>

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
                  No inbound sessions — listener waits for modem connect.
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
                    <TableCell className="max-w-[min(14rem,30vw)] align-top text-xs whitespace-normal break-words text-muted-foreground">
                      {formatOperatorDateTime(row.acceptedAtUtc)}
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
                        disabled={!serial || !!reg || tcpActionBusy}
                        onClick={() => void onAddSerial(serial!)}
                      >
                        {addInFlight ? (
                          <Loader2Icon className="mr-1 size-3.5 animate-spin" aria-hidden />
                        ) : null}
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
