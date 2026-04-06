"use client"

import { AlertCircleIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

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
  postDirectReadBasicRegisters,
  postDirectReadIdentity,
  postTcpListenerReadBasicRegisters,
  postTcpListenerReadIdentity,
  READINGS_FETCH_NETWORK_ERROR,
  type TcpListenerStatus,
} from "@/lib/readings/api"
import {
  getCatalogRowsForPack,
  OBIS_PACK_LABELS,
  OBIS_PACK_ORDER,
  SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS,
} from "@/lib/obis/catalog-seed"
import {
  mergeBasicRegistersIntoRowState,
  mergeIdentityIntoRowState,
  obisNeedsBasicRegistersRead,
  obisNeedsIdentityRead,
  obisOutsideCurrentRuntimePack,
  type ObisRowReadState,
} from "@/lib/obis/merge-read-results"
import type { ObisPackKey } from "@/lib/obis/types"
import type { MeterListRow } from "@/types/meter"
import type {
  BasicRegistersPayload,
  IdentityPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"
import { cn } from "@/lib/utils"

const POLL_MS = 6000

type TransportMode = "inbound" | "direct"

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1
}

function applyEnvelopeToRows(
  prev: Record<string, ObisRowReadState>,
  envelope: RuntimeResponseEnvelope<IdentityPayload | BasicRegistersPayload>
): Record<string, ObisRowReadState> {
  const t = envelope.finishedAt
  if (!envelope.ok) {
    return prev
  }
  if (envelope.operation === "readIdentity" && envelope.payload) {
    return mergeIdentityIntoRowState(prev, envelope.payload as IdentityPayload, t)
  }
  if (envelope.operation === "readBasicRegisters" && envelope.payload) {
    return mergeBasicRegistersIntoRowState(
      prev,
      envelope.payload as BasicRegistersPayload,
      t
    )
  }
  return prev
}

function markObisError(
  prev: Record<string, ObisRowReadState>,
  obisList: string[],
  message: string,
  at: string
): Record<string, ObisRowReadState> {
  const next = { ...prev }
  for (const o of obisList) {
    next[o] = {
      result: "",
      status: "error",
      error: message,
      lastReadAt: at,
    }
  }
  return next
}

export function ReadingsWorkspaceClient() {
  const [pack, setPack] = useState<ObisPackKey>("basic_setting")
  const [transport, setTransport] = useState<TransportMode>("inbound")
  const [meterId, setMeterId] = useState("hes-mt-10021")
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
  const [actionError, setActionError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [lastEnv, setLastEnv] = useState<RuntimeResponseEnvelope<
    IdentityPayload | BasicRegistersPayload
  > | null>(null)

  const catalogRows = useMemo(() => getCatalogRowsForPack(pack), [pack])

  useEffect(() => {
    setSelected(new Set())
  }, [pack])

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/meters", { signal: ac.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMeters(data as MeterListRow[])
          setMetersError(null)
        } else {
          setMeters([])
          setMetersError("Meters catalog unavailable")
        }
      })
      .catch(() => {
        setMeters([])
        setMetersError("Meters catalog load failed")
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

  const canInboundRead =
    transport === "inbound" &&
    stagedPresent &&
    !triggerInProgress &&
    !busy &&
    !statusLoading

  const canDirectRead = transport === "direct" && !busy

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

  async function runIdentityInbound() {
    return postTcpListenerReadIdentity(meterId.trim() || "inbound-modem")
  }

  async function runBasicInbound() {
    return postTcpListenerReadBasicRegisters(meterId.trim() || "inbound-modem")
  }

  async function runIdentityDirect() {
    return postDirectReadIdentity(meterId.trim() || "meter-1")
  }

  async function runBasicDirect() {
    return postDirectReadBasicRegisters(meterId.trim() || "meter-1")
  }

  async function executeReadsForObisList(obisList: string[]): Promise<void> {
    setActionError(null)
    setHint(null)
    const idNeed = obisNeedsIdentityRead(obisList)
    const basicNeed = obisNeedsBasicRegistersRead(obisList)
    const outside = obisOutsideCurrentRuntimePack(obisList)
    const iso = new Date().toISOString()

    if (outside.length > 0) {
      setHint(
        `${outside.length} OBIS not in current runtime pack (identity-mapped + default basic: ${SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS.join(", ")}).`
      )
    }

    const targetInside = obisList.filter((o) => !outside.includes(o))
    if (targetInside.length === 0) {
      setActionError("No selected OBIS are readable with the current runtime pack.")
      setRowState((p) => markObisError(p, obisList, "not_in_runtime_pack", iso))
      return
    }

    if (transport === "inbound") {
      if (idNeed && basicNeed) {
        setActionError(
          "Inbound staged TCP: each read closes the socket. Select only identity OBIS (0.0.96.1.0/1) or only default basic-register OBIS, then reconnect the modem between runs — or switch to Direct transport."
        )
        return
      }
      setBusy(true)
      try {
        if (idNeed) {
          const r = await runIdentityInbound()
          if (!r.ok) {
            setActionError(r.error)
            return
          }
          setLastEnv(r.data)
          if (r.data.ok) {
            setRowState((p) => applyEnvelopeToRows(p, r.data))
          } else {
            setRowState((p) =>
              markObisError(
                p,
                targetInside.filter((o) => obisNeedsIdentityRead([o])),
                r.data.error?.message ?? "identity_failed",
                r.data.finishedAt
              )
            )
          }
        } else if (basicNeed) {
          const r = await runBasicInbound()
          if (!r.ok) {
            setActionError(r.error)
            return
          }
          setLastEnv(r.data)
          if (r.data.ok) {
            setRowState((p) => applyEnvelopeToRows(p, r.data))
          } else {
            setRowState((p) =>
              markObisError(
                p,
                targetInside.filter((o) => obisNeedsBasicRegistersRead([o])),
                r.data.error?.message ?? "basic_failed",
                r.data.finishedAt
              )
            )
          }
        } else {
          setActionError(
            "None of the target OBIS use identity or default basic-register reads in this build."
          )
        }
      } finally {
        setBusy(false)
        await loadStatus()
      }
      return
    }

    // direct: may run identity then basic (separate sidecar sessions).
    setBusy(true)
    try {
      if (idNeed) {
        const r = await runIdentityDirect()
        if (!r.ok) {
          setActionError(r.error)
          return
        }
        setLastEnv(r.data)
        if (r.data.ok) {
          setRowState((p) => applyEnvelopeToRows(p, r.data))
        } else {
          setRowState((p) =>
            markObisError(
              p,
              targetInside.filter((o) => obisNeedsIdentityRead([o])),
              r.data.error?.message ?? "readIdentity_failed",
              r.data.finishedAt
            )
          )
        }
      }
      if (basicNeed) {
        const r = await runBasicDirect()
        if (!r.ok) {
          setActionError(r.error)
          return
        }
        setLastEnv(r.data)
        if (r.data.ok) {
          setRowState((p) => applyEnvelopeToRows(p, r.data))
        } else {
          setRowState((p) =>
            markObisError(
              p,
              targetInside.filter((o) => obisNeedsBasicRegistersRead([o])),
              r.data.error?.message ?? "readBasicRegisters_failed",
              r.data.finishedAt
            )
          )
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function onReadSelected() {
    if (selected.size === 0) {
      setActionError("Select at least one OBIS row.")
      return
    }
    await executeReadsForObisList([...selected])
  }

  async function onReadCategory() {
    const obis = catalogRows.filter((r) => r.enabled).map((r) => r.obis)
    if (obis.length === 0) return
    await executeReadsForObisList(obis)
  }

  const triggerRecord =
    listenerStatus?.lastTcpListenerTrigger &&
    typeof listenerStatus.lastTcpListenerTrigger === "object"
      ? (listenerStatus.lastTcpListenerTrigger as Record<string, unknown>)
      : null

  return (
    <div className="space-y-4">
      <PageHeader
        title="Readings"
        subtitle="Meter-tool style workspace: packs, OBIS table, and runtime reads via Next server proxies (no browser→Python)."
      />

      {transport === "inbound" ? (
        <div className="rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Inbound staged TCP:</strong> each read consumes the modem socket (modem must
          reconnect for the next read). You cannot combine identity + basic registers in one
          dial — use <strong>Direct</strong> for back-to-back reads on serial/TCP client.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(200px,240px)_1fr] lg:items-start">
        <aside className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Meter parameter
          </p>
          <ul className="mt-2 space-y-0.5">
            {OBIS_PACK_ORDER.map((key) => (
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
                  {OBIS_PACK_LABELS[key]}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            <a href="/obis-config" className="underline underline-offset-2">
              OBIS catalog
            </a>
          </p>
        </aside>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex min-w-[12rem] flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Meter</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={meters.some((m) => m.id === meterId) ? meterId : "__custom__"}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "__custom__") return
                  setMeterId(v)
                }}
              >
                <option value="__custom__">Custom meterId…</option>
                {meters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.serialNumber} ({m.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">meterId</span>
              <Input
                value={meterId}
                onChange={(e) => setMeterId(e.target.value)}
                className="h-9 font-mono text-sm"
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
                <option value="inbound">Inbound modem (staged TCP)</option>
                <option value="direct">Direct (serial / TCP client)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Groups</span>
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" disabled>
                <option>Multi-meter (planned)</option>
              </select>
            </div>
          </div>

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
            <Button type="button" size="sm" variant="outline" disabled title="Planned">
              Export
            </Button>
          </div>

          {metersError ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{metersError}</p>
          ) : null}
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          {actionError ? (
            <p className="text-xs text-destructive">{actionError}</p>
          ) : null}
          {busy ? (
            <p className="text-xs text-muted-foreground">Running runtime request…</p>
          ) : null}

          {lastEnv ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
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
                  <TableHead className="whitespace-nowrap">OBIS</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="whitespace-nowrap">Type</TableHead>
                  <TableHead className="text-right">Class</TableHead>
                  <TableHead className="text-right">Attr</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Pack</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="whitespace-nowrap">Last read</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogRows.map((r) => {
                  const rs = rowState[r.obis]
                  return (
                    <TableRow key={r.obis}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(r.obis)}
                          onChange={() => toggleObis(r.obis)}
                          aria-label={`Select ${r.obis}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.obis}</TableCell>
                      <TableCell className="max-w-[180px] text-xs">
                        {r.description}
                      </TableCell>
                      <TableCell className="text-xs">{r.object_type}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.class_id}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.attribute}
                      </TableCell>
                      <TableCell className="text-xs">{r.unit || "—"}</TableCell>
                      <TableCell className="text-xs">{OBIS_PACK_LABELS[r.pack_key]}</TableCell>
                      <TableCell className="max-w-[140px] truncate font-mono text-xs">
                        {rs?.result ?? ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        {rs?.status ? (
                          <StatusBadge
                            variant={
                              rs.status === "ok"
                                ? "success"
                                : rs.status === "error"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {rs.status}
                          </StatusBadge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs text-destructive">
                        {rs?.error ?? ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                        {rs?.lastReadAt ?? "—"}
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
