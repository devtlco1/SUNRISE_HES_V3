"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RuntimeAdapterPublicStatus } from "@/lib/runtime/adapter-mode"
import type { RuntimeResponseEnvelope } from "@/types/runtime"
import { useCallback, useEffect, useState } from "react"

type LastCall =
  | { kind: "envelope"; data: RuntimeResponseEnvelope }
  | { kind: "http_error"; status: number; body: unknown }
  | { kind: "network"; message: string }

const ACTIONS = [
  { id: "probe", label: "Probe", path: "/api/runtime/probe" },
  { id: "associate", label: "Associate", path: "/api/runtime/associate" },
  { id: "read-identity", label: "Read identity", path: "/api/runtime/read-identity" },
  { id: "read-clock", label: "Read clock", path: "/api/runtime/read-clock" },
  {
    id: "read-basic-registers",
    label: "Read basic registers",
    path: "/api/runtime/read-basic-registers",
  },
  {
    id: "relay-disconnect",
    label: "Relay disconnect (simulated / skeleton)",
    path: "/api/runtime/relay-disconnect",
  },
  {
    id: "relay-reconnect",
    label: "Relay reconnect (simulated / skeleton)",
    path: "/api/runtime/relay-reconnect",
  },
] as const

function isEnvelope(x: unknown): x is RuntimeResponseEnvelope {
  if (x === null || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return (
    typeof o.operation === "string" &&
    typeof o.meterId === "string" &&
    typeof o.ok === "boolean" &&
    typeof o.simulated === "boolean"
  )
}

export function DevRuntimeHarnessClient() {
  const [meterId, setMeterId] = useState("hes-mt-10021")
  const [endpointId, setEndpointId] = useState("")
  const [channelHint, setChannelHint] = useState("")
  const [status, setStatus] = useState<RuntimeAdapterPublicStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [lastCall, setLastCall] = useState<LastCall | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatusError(null)
    try {
      const res = await fetch("/api/runtime/status", { cache: "no-store" })
      if (!res.ok) {
        setStatusError(`HTTP ${res.status}`)
        return
      }
      const data: unknown = await res.json()
      setStatus(data as RuntimeAdapterPublicStatus)
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "status fetch failed")
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  async function runAction(path: string, actionId: string) {
    setLoadingAction(actionId)
    setLastCall(null)
    const body: Record<string, string> = { meterId: meterId.trim() }
    if (endpointId.trim()) body.endpointId = endpointId.trim()
    if (channelHint.trim()) body.channelHint = channelHint.trim()
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        setLastCall({
          kind: "http_error",
          status: res.status,
          body: text.slice(0, 2000),
        })
        return
      }
      if (!res.ok) {
        setLastCall({ kind: "http_error", status: res.status, body: parsed })
        return
      }
      if (isEnvelope(parsed)) {
        setLastCall({ kind: "envelope", data: parsed })
        return
      }
      setLastCall({ kind: "http_error", status: res.status, body: parsed })
    } catch (e) {
      setLastCall({
        kind: "network",
        message: e instanceof Error ? e.message : "request failed",
      })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="space-y-8 font-mono text-sm">
      <header className="space-y-1 border-b border-border pb-4">
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Runtime test harness
        </h1>
        <p className="text-muted-foreground">
          Calls internal POST <code className="text-foreground">/api/runtime/*</code>{" "}
          routes. Stub: <code className="text-foreground">simulated: true</code>,{" "}
          <code className="text-foreground">diagnostics.outcome: simulated_success</code>
          . Real: see <code className="text-foreground">diagnostics</code> (
          <code className="text-foreground">not_attempted</code>,{" "}
          <code className="text-foreground">not_implemented</code>,{" "}
          <code className="text-foreground">attempted_failed</code>,{" "}
          <code className="text-foreground">transport_reachable_unverified</code>,{" "}
          <code className="text-foreground">verified_on_wire_success</code> (e.g. AARE accepted
          on associate), etc.). <code className="text-foreground">verifiedOnWire</code> is true
          only when diagnostics say so (not for TCP-only probe).
        </p>
      </header>

      <section className="space-y-2 rounded-md border border-border bg-card p-4 text-card-foreground">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Adapter status
        </h2>
        {statusError && (
          <p className="text-destructive text-xs">Failed to load status: {statusError}</p>
        )}
        {status && (
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Configured mode</dt>
              <dd className="font-medium text-foreground">{status.configuredMode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Effective adapter</dt>
              <dd className="font-medium text-foreground">{status.effectiveAdapter}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Simulated responses</dt>
              <dd
                className={
                  status.simulatedResponses
                    ? "font-bold text-amber-700 dark:text-amber-400"
                    : "font-bold text-orange-700 dark:text-orange-400"
                }
              >
                {status.simulatedResponses ? "yes (stub or fallback)" : "no — skeleton only"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">RUNTIME_ADAPTER</dt>
              <dd className="break-all text-foreground">{status.envValue}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Summary</dt>
              <dd className="text-foreground">{status.summary}</dd>
            </div>
            {status.warning && (
              <div className="sm:col-span-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-900 dark:text-amber-100">
                {status.warning}
              </div>
            )}
          </dl>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => refreshStatus()}>
          Refresh status
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Request
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">meterId</span>
            <Input
              value={meterId}
              onChange={(e) => setMeterId(e.target.value)}
              className="font-mono text-xs"
              autoComplete="off"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">endpointId (optional)</span>
            <Input
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              className="font-mono text-xs"
              autoComplete="off"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">channelHint (optional)</span>
            <Input
              value={channelHint}
              onChange={(e) => setChannelHint(e.target.value)}
              className="font-mono text-xs"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <Button
              key={a.id}
              type="button"
              variant="secondary"
              size="sm"
              disabled={loadingAction !== null}
              onClick={() => runAction(a.path, a.id)}
            >
              {loadingAction === a.id ? "…" : a.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Last result
        </h2>
        {!lastCall && (
          <p className="text-xs text-muted-foreground">No call yet.</p>
        )}
        {lastCall?.kind === "network" && (
          <p className="text-destructive text-xs">{lastCall.message}</p>
        )}
        {lastCall?.kind === "http_error" && (
          <div className="space-y-2 text-xs">
            <p className="text-destructive">HTTP {lastCall.status}</p>
            <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
              {JSON.stringify(lastCall.body, null, 2)}
            </pre>
          </div>
        )}
        {lastCall?.kind === "envelope" && (
          <EnvelopeViewer envelope={lastCall.data} />
        )}
      </section>
    </div>
  )
}

function EnvelopeViewer({ envelope }: { envelope: RuntimeResponseEnvelope }) {
  const simulatedHighlight =
    envelope.simulated === true
      ? "rounded border-2 border-amber-500 bg-amber-500/10 px-2 py-1 text-amber-950 dark:text-amber-100"
      : "rounded border-2 border-orange-500 bg-orange-500/10 px-2 py-1 text-orange-950 dark:text-orange-100"

  return (
    <div className="space-y-3 text-xs">
      <div className={simulatedHighlight}>
        <span className="font-semibold">simulated:</span>{" "}
        {String(envelope.simulated)} ·<span className="font-semibold"> ok:</span>{" "}
        {String(envelope.ok)}
      </div>
      <dl className="grid gap-2 border border-border bg-muted/20 p-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">operation</dt>
          <dd className="font-medium">{envelope.operation}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">meterId</dt>
          <dd className="break-all font-medium">{envelope.meterId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">startedAt</dt>
          <dd>{envelope.startedAt}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">finishedAt</dt>
          <dd>{envelope.finishedAt}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">durationMs</dt>
          <dd>{envelope.durationMs}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">transportState</dt>
          <dd>{envelope.transportState}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">associationState</dt>
          <dd>{envelope.associationState}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">message</dt>
          <dd className="text-foreground">{envelope.message}</dd>
        </div>
        {envelope.diagnostics && (
          <div className="sm:col-span-2 rounded border border-border bg-muted/30 p-2">
            <dt className="text-muted-foreground">diagnostics</dt>
            <dd className="mt-1 grid gap-1 font-mono text-[11px] text-foreground sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">outcome:</span>{" "}
                {envelope.diagnostics.outcome}
              </div>
              <div>
                <span className="text-muted-foreground">capabilityStage:</span>{" "}
                {envelope.diagnostics.capabilityStage}
              </div>
              <div>
                <span className="text-muted-foreground">transportAttempted:</span>{" "}
                {String(envelope.diagnostics.transportAttempted)}
              </div>
              <div>
                <span className="text-muted-foreground">associationAttempted:</span>{" "}
                {String(envelope.diagnostics.associationAttempted)}
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">verifiedOnWire:</span>{" "}
                <span
                  className={
                    envelope.diagnostics.verifiedOnWire
                      ? "font-semibold text-green-700 dark:text-green-400"
                      : "font-semibold"
                  }
                >
                  {String(envelope.diagnostics.verifiedOnWire)}
                </span>
              </div>
              {envelope.diagnostics.detailCode && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">detailCode:</span>{" "}
                  {envelope.diagnostics.detailCode}
                </div>
              )}
            </dd>
          </div>
        )}
        {envelope.error && (
          <div className="sm:col-span-2 rounded border border-destructive/30 bg-destructive/5 p-2">
            <dt className="text-muted-foreground">error</dt>
            <dd className="mt-1 font-mono text-[11px]">
              <div>
                <span className="text-muted-foreground">code:</span> {envelope.error.code}
              </div>
              <div>
                <span className="text-muted-foreground">message:</span>{" "}
                {envelope.error.message}
              </div>
              {envelope.error.details && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(envelope.error.details, null, 2)}
                </pre>
              )}
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="mb-1 text-muted-foreground">payload summary</dt>
          <dd>
            {envelope.payload === undefined ? (
              <span className="text-muted-foreground">(none)</span>
            ) : (
              <pre className="max-h-48 overflow-auto rounded border border-border bg-background p-2 text-[11px] leading-relaxed">
                {JSON.stringify(envelope.payload, null, 2)}
              </pre>
            )}
          </dd>
        </div>
      </dl>
      <div>
        <div className="mb-1 text-muted-foreground">Raw JSON</div>
        <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">
          {JSON.stringify(envelope, null, 2)}
        </pre>
      </div>
    </div>
  )
}
