"use client"

import { AlertCircleIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchTcpListenerStatus,
  postTcpListenerReadBasicRegisters,
  postTcpListenerReadIdentity,
  READINGS_FETCH_NETWORK_ERROR,
  type TcpListenerStatus,
} from "@/lib/readings/api"
import type {
  BasicRegisterReading,
  BasicRegistersPayload,
  IdentityPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"
import { cn } from "@/lib/utils"

const POLL_MS = 6000

/** Presentation-only labels for common default OBIS keys (values still from payload). */
const OBIS_LABELS: Record<string, string> = {
  "0.0.1.0.0.255": "Meter clock",
  "1.0.1.8.0.255": "Total active import (+A)",
  "1.0.32.7.0.255": "Voltage L1",
}

function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === 1
}

function formatTriggerSummary(status: TcpListenerStatus) {
  const t = status.lastTcpListenerTrigger
  if (!t || typeof t !== "object") return null
  return t as Record<string, unknown>
}

function EnvelopeSummary({
  envelope,
}: {
  envelope: RuntimeResponseEnvelope<unknown>
}) {
  const d = envelope.diagnostics
  const ok = envelope.ok
  const sim = envelope.simulated

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <StatusBadge variant="success">Success</StatusBadge>
        ) : (
          <StatusBadge variant="danger">Failed</StatusBadge>
        )}
        {sim ? (
          <StatusBadge variant="warning">Simulated</StatusBadge>
        ) : (
          <StatusBadge variant="neutral">Real runtime</StatusBadge>
        )}
        {d?.verifiedOnWire ? (
          <StatusBadge variant="success">Verified on wire</StatusBadge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          operation:{" "}
          <span className="font-mono text-foreground">{envelope.operation}</span>
        </span>
      </div>
      <p className="text-foreground">{envelope.message}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Started</dt>
          <dd className="font-mono text-xs">{envelope.startedAt}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Finished</dt>
          <dd className="font-mono text-xs">{envelope.finishedAt}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Duration</dt>
          <dd className="tabular-nums">{envelope.durationMs} ms</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Transport / association</dt>
          <dd>
            <span className="font-mono text-xs">{envelope.transportState}</span>
            {" / "}
            <span className="font-mono text-xs">{envelope.associationState}</span>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">detailCode</dt>
          <dd className="font-mono text-xs">{d?.detailCode ?? "—"}</dd>
        </div>
      </dl>
      {envelope.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs font-medium text-destructive">
            {envelope.error.code}
          </p>
          <p className="text-xs text-muted-foreground">{envelope.error.message}</p>
        </div>
      ) : null}
    </div>
  )
}

function IdentityResult({ payload }: { payload: IdentityPayload }) {
  const rows: { label: string; value: string }[] = [
    { label: "Serial number", value: payload.serialNumber },
    { label: "Logical device name", value: payload.logicalDeviceName ?? "—" },
    { label: "Protocol version", value: payload.protocolVersion },
    { label: "Manufacturer", value: payload.manufacturer },
    { label: "Model", value: payload.model },
    { label: "Firmware", value: payload.firmwareVersion },
  ]
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label}>
          <dt className="text-xs text-muted-foreground">{r.label}</dt>
          <dd className="text-sm font-medium break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function RegisterRow({
  obis,
  reading,
}: {
  obis: string
  reading: BasicRegisterReading
}) {
  const title = OBIS_LABELS[obis] ?? obis
  const err = reading.error
  const ok = !err && Boolean((reading.value ?? "").trim())

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        ok ? "border-border bg-muted/20" : "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="font-mono text-xs text-muted-foreground">{obis}</p>
        </div>
        {ok ? (
          <StatusBadge variant="success">OK</StatusBadge>
        ) : (
          <StatusBadge variant="warning">Issue</StatusBadge>
        )}
      </div>
      <p className="mt-2 tabular-nums text-lg font-semibold tracking-tight">
        {reading.value || "—"}
        {reading.unit ? (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {reading.unit}
          </span>
        ) : null}
      </p>
      {reading.quality ? (
        <p className="text-xs text-muted-foreground">Quality: {reading.quality}</p>
      ) : null}
      {err ? (
        <p className="text-xs text-amber-900 dark:text-amber-100">{err}</p>
      ) : null}
    </div>
  )
}

function BasicRegistersResult({ payload }: { payload: BasicRegistersPayload }) {
  const entries = Object.entries(payload.registers ?? {})
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No registers in payload.</p>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
      {entries.map(([obis, reading]) => (
        <RegisterRow key={obis} obis={obis} reading={reading} />
      ))}
    </div>
  )
}

export function ReadingsWorkspaceClient() {
  const [meterId, setMeterId] = useState("inbound-modem")
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [listenerStatus, setListenerStatus] = useState<TcpListenerStatus | null>(
    null
  )
  const [triggerBusy, setTriggerBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastEnvelope, setLastEnvelope] = useState<RuntimeResponseEnvelope<
    IdentityPayload | BasicRegistersPayload
  > | null>(null)

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
    loadStatus(ac.signal)
      .finally(() => {
        if (!ac.signal.aborted) setStatusLoading(false)
      })
    return () => ac.abort()
  }, [loadStatus])

  useEffect(() => {
    const id = window.setInterval(() => {
      const ac = new AbortController()
      loadStatus(ac.signal).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(id)
  }, [loadStatus])

  const stagedPresent = listenerStatus ? boolish(listenerStatus.stagedPresent) : false
  const triggerInProgress = listenerStatus
    ? boolish(listenerStatus.sessionTriggerInProgress)
    : false
  const canTrigger =
    stagedPresent && !triggerInProgress && !triggerBusy && !statusLoading

  const listening = listenerStatus ? boolish(listenerStatus.listening) : false
  const listenerEnabled = listenerStatus
    ? boolish(listenerStatus.listenerEnabled)
    : false

  const triggerRecord = useMemo(
    () => (listenerStatus ? formatTriggerSummary(listenerStatus) : null),
    [listenerStatus]
  )

  async function runIdentity() {
    setTriggerBusy(true)
    setActionError(null)
    setLastEnvelope(null)
    try {
      const r = await postTcpListenerReadIdentity(meterId.trim() || "inbound-modem")
      if (r.ok) {
        setLastEnvelope(r.data)
      } else {
        setActionError(r.error)
      }
    } finally {
      setTriggerBusy(false)
      await loadStatus()
    }
  }

  async function runBasicRegisters() {
    setTriggerBusy(true)
    setActionError(null)
    setLastEnvelope(null)
    try {
      const r = await postTcpListenerReadBasicRegisters(
        meterId.trim() || "inbound-modem"
      )
      if (r.ok) {
        setLastEnvelope(r.data)
      } else {
        setActionError(r.error)
      }
    } finally {
      setTriggerBusy(false)
      await loadStatus()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Readings"
        subtitle="Inbound modem listener, staged socket, and on-demand identity / basic-register reads via the Python runtime (server-side proxy)."
      />

      <SectionCard
        title="Meter target"
        description="Forwarded as meterId on runtime requests."
        className="bg-card"
      >
        <div className="flex max-w-md flex-col gap-2">
          <label
            htmlFor="readings-meter-id"
            className="text-sm font-medium text-foreground"
          >
            meterId
          </label>
          <Input
            id="readings-meter-id"
            value={meterId}
            onChange={(e) => setMeterId(e.target.value)}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Inbound modem TCP listener"
        description="Python sidecar staged listener — refresh or wait for automatic poll."
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={statusLoading}
            onClick={() => {
              setStatusLoading(true)
              loadStatus().finally(() => setStatusLoading(false))
            }}
          >
            <RefreshCwIcon
              className={cn("mr-1.5 size-4", statusLoading && "animate-spin")}
              aria-hidden
            />
            Refresh status
          </Button>
        }
      >
        {statusLoading && !listenerStatus ? (
          <div className="h-24 animate-pulse rounded-md bg-muted/30" />
        ) : null}

        {statusError && !listenerStatus ? (
          <EmptyState
            title="Listener status unavailable"
            description={statusError}
            icon={<AlertCircleIcon className="size-5" aria-hidden />}
            className="border-dashed bg-muted/10"
          />
        ) : null}

        {listenerStatus ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {listenerEnabled ? (
                <StatusBadge variant="success">Listener enabled</StatusBadge>
              ) : (
                <StatusBadge variant="warning">Listener disabled</StatusBadge>
              )}
              {listening ? (
                <StatusBadge variant="success">Bound / listening</StatusBadge>
              ) : (
                <StatusBadge variant="danger">Not listening</StatusBadge>
              )}
              {stagedPresent ? (
                <StatusBadge variant="success">Staged socket present</StatusBadge>
              ) : (
                <StatusBadge variant="neutral">No staged socket</StatusBadge>
              )}
              {triggerInProgress ? (
                <StatusBadge variant="info">Trigger in progress</StatusBadge>
              ) : null}
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Bind</dt>
                <dd className="font-mono text-xs">
                  {String(listenerStatus.bindHost ?? "—")}:
                  {String(listenerStatus.bindPort ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Staged remote</dt>
                <dd className="font-mono text-xs">
                  {stagedPresent
                    ? `${String(listenerStatus.stagedRemoteHost ?? "?")}:${String(listenerStatus.stagedRemotePort ?? "?")}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Staged at (UTC)</dt>
                <dd className="font-mono text-xs">
                  {stagedPresent
                    ? String(listenerStatus.stagedAcceptedAtUtc ?? "—")
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Last replacement</dt>
                <dd className="break-words text-xs">
                  {listenerStatus.lastStagedReplacementReason != null
                    ? String(listenerStatus.lastStagedReplacementReason)
                    : "—"}
                </dd>
              </div>
              {listenerStatus.lastBindError ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs text-destructive">Bind error</dt>
                  <dd className="text-xs text-destructive">
                    {String(listenerStatus.lastBindError)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {!stagedPresent && listenerEnabled && listening ? (
              <p className="rounded-md border border-dashed border-border bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
                No modem connection staged yet. When the modem connects inbound, this
                panel will show the remote endpoint — then you can run reads.
              </p>
            ) : null}

            {triggerRecord ? (
              <div className="rounded-md border border-border bg-muted/10 px-3 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Last trigger (from sidecar status)
                </h3>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Operation</dt>
                    <dd className="font-mono">
                      {String(triggerRecord.operation ?? "—")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">OK</dt>
                    <dd>{String(triggerRecord.ok)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">detailCode</dt>
                    <dd className="break-all font-mono text-xs">
                      {String(triggerRecord.detailCode ?? "—")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Remote</dt>
                    <dd className="font-mono text-xs">
                      {String(triggerRecord.remoteEndpoint ?? "—")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Socket teardown</dt>
                    <dd className="font-mono text-xs">
                      {String(triggerRecord.socketTeardown ?? "—")}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Message</dt>
                    <dd className="text-xs">{String(triggerRecord.message ?? "—")}</dd>
                  </div>
                </dl>
                {triggerRecord.diagnosticsSummary &&
                typeof triggerRecord.diagnosticsSummary === "object" ? (
                  <div className="mt-3 text-xs">
                    <p className="font-medium text-muted-foreground">
                      Diagnostics summary
                    </p>
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-background/80 p-2 font-mono">
                      {JSON.stringify(triggerRecord.diagnosticsSummary, null, 2)}
                    </pre>
                  </div>
                ) : null}
                {triggerRecord.hints &&
                typeof triggerRecord.hints === "object" ? (
                  <div className="mt-3 text-xs">
                    <p className="font-medium text-muted-foreground">Hints</p>
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-background/80 p-2 font-mono">
                      {JSON.stringify(triggerRecord.hints, null, 2)}
                    </pre>
                  </div>
                ) : null}
                {triggerRecord.basicRegistersSummary &&
                typeof triggerRecord.basicRegistersSummary === "object" ? (
                  <div className="mt-3 text-xs">
                    <p className="font-medium text-muted-foreground">
                      Basic registers summary
                    </p>
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-background/80 p-2 font-mono">
                      {JSON.stringify(triggerRecord.basicRegistersSummary, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No trigger completed yet in this process (lastTcpListenerTrigger empty).
              </p>
            )}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Actions"
        description="Runs MVP-AMI on the staged inbound socket; socket closes after each trigger."
        headerActions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canTrigger}
              onClick={() => void runIdentity()}
            >
              Read identity
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canTrigger}
              onClick={() => void runBasicRegisters()}
            >
              Read basic registers
            </Button>
          </div>
        }
      >
        {!canTrigger && listenerStatus ? (
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">
            {triggerBusy
              ? "A read is running…"
              : triggerInProgress
                ? "Sidecar reports a trigger already in progress."
                : !stagedPresent
                  ? "Connect the modem inbound to stage a socket before running reads."
                  : "Cannot trigger right now."}
          </p>
        ) : null}
        {triggerBusy ? (
          <p className="text-sm text-muted-foreground">Executing runtime request…</p>
        ) : null}
        {actionError ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Latest reading result"
        description="Last envelope returned from Read identity or Read basic registers (includes runtime ok: false)."
      >
        {!lastEnvelope ? (
          <p className="text-sm text-muted-foreground">
            No envelope yet — run an action when a modem socket is staged.
          </p>
        ) : (
          <div className="space-y-6">
            <EnvelopeSummary envelope={lastEnvelope} />
            {lastEnvelope.ok && lastEnvelope.operation === "readIdentity" && lastEnvelope.payload ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Identity</h3>
                <IdentityResult payload={lastEnvelope.payload as IdentityPayload} />
              </div>
            ) : null}
            {lastEnvelope.ok &&
            lastEnvelope.operation === "readBasicRegisters" &&
            lastEnvelope.payload ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold">Basic registers</h3>
                <BasicRegistersResult
                  payload={lastEnvelope.payload as BasicRegistersPayload}
                />
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
