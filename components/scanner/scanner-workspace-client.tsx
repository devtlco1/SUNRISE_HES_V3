"use client"

import { RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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

export function ScannerWorkspaceClient() {
  const [statusLoading, setStatusLoading] = useState(true)
  const [listenerStatus, setListenerStatus] = useState<TcpListenerStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [meters, setMeters] = useState<MeterListRow[]>([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [identifiedSerial, setIdentifiedSerial] = useState<string | null>(null)
  const [identifyState, setIdentifyState] = useState<"idle" | "ok" | "error">("idle")
  const lastEndpointRef = useRef<string | null>(null)

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
    return () => clearInterval(id)
  }, [loadStatus])

  const stagedPresent = listenerStatus ? boolish(listenerStatus.stagedPresent) : false
  const triggerInProgress = listenerStatus
    ? boolish(listenerStatus.sessionTriggerInProgress)
    : false
  const listening = listenerStatus ? boolish(listenerStatus.listening) : false
  const listenerEnabled = listenerStatus ? boolish(listenerStatus.listenerEnabled) : false

  const remoteEp = useMemo(() => {
    if (!listenerStatus || !stagedPresent) return null
    const h = listenerStatus.stagedRemoteHost
    const p = listenerStatus.stagedRemotePort
    if (typeof h === "string" && h && p != null) return `${h}:${p}`
    return null
  }, [listenerStatus, stagedPresent])

  const stagedSince =
    listenerStatus && typeof listenerStatus.stagedAcceptedAtUtc === "string"
      ? listenerStatus.stagedAcceptedAtUtc
      : null

  const stageKey =
    stagedPresent && remoteEp && stagedSince ? `${remoteEp}|${stagedSince}` : null

  useEffect(() => {
    if (!stageKey) return
    if (stageKey !== lastEndpointRef.current) {
      lastEndpointRef.current = stageKey
      setIdentifiedSerial(null)
      setIdentifyState("idle")
      setActionError(null)
    }
  }, [stageKey])

  const isRegistered = identifiedSerial
    ? serialAlreadyRegistered(identifiedSerial, meters)
    : false

  async function onIdentify() {
    setActionError(null)
    if (!stagedPresent || triggerInProgress) {
      setActionError("No staged socket.")
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
      const val =
        (p?.serialNumber ?? "").trim() ||
        (p?.logicalDeviceName ?? "").trim()
      if (!val) {
        setIdentifyState("error")
        setActionError("No serial / logical device from identity read")
        return
      }
      setIdentifiedSerial(val)
      setIdentifyState("ok")
      await reloadMeters()
    } finally {
      setBusy(false)
      await loadStatus()
    }
  }

  async function onAdd() {
    if (!identifiedSerial) return
    setActionError(null)
    setBusy(true)
    try {
      const res = await fetch("/api/meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: identifiedSerial }),
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

  const canIdentify =
    stagedPresent && !triggerInProgress && !busy && !statusLoading && listenerEnabled

  return (
    <div className="space-y-4">
      <PageHeader title="Scanner" subtitle="Inbound modem staging and serial onboarding." />

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

      {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}

      <div className="overflow-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Remote</TableHead>
              <TableHead>Staged since</TableHead>
              <TableHead>Socket</TableHead>
              <TableHead>Serial (0.0.96.1.0.255)</TableHead>
              <TableHead>Identify</TableHead>
              <TableHead>Registry</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono text-xs">
                {remoteEp ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-[10px] text-muted-foreground">
                {stagedSince ?? "—"}
              </TableCell>
              <TableCell>
                <StatusBadge variant={stagedPresent ? "success" : "neutral"}>
                  {stagedPresent ? "open" : "none"}
                </StatusBadge>
              </TableCell>
              <TableCell className="max-w-[200px] truncate font-mono text-xs">
                {identifiedSerial ?? "—"}
                {identifyState === "error" ? (
                  <span className="ml-1 text-destructive">failed</span>
                ) : null}
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canIdentify}
                  onClick={() => void onIdentify()}
                >
                  Identify
                </Button>
              </TableCell>
              <TableCell>
                {identifiedSerial ? (
                  <StatusBadge variant={isRegistered ? "success" : "warning"}>
                    {isRegistered ? "Registered" : "Not registered"}
                  </StatusBadge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  disabled={!identifiedSerial || !!isRegistered || busy}
                  onClick={() => void onAdd()}
                >
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
