"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

import { DetailBlock, DlGrid } from "@/components/shared/entity-detail-blocks"
import { SectionCard } from "@/components/shared/section-card"
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
import type { ConnectivityMeterDetailPayload } from "@/types/connectivity"
import { phase1LiveStatusPresentation } from "@/lib/connectivity/phase1-status-present"
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import { formatCommStatus } from "@/lib/meters/format"
import { operationalListPageStackClass } from "@/lib/ui/operational"
import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type { ConnectivityEventRecord } from "@/types/connectivity-events"

function eventSeverityVariant(s: ConnectivityEventRecord["severity"]): StatusBadgeVariant {
  if (s === "error") return "danger"
  if (s === "warning") return "warning"
  return "neutral"
}

function isDetailPayload(v: unknown): v is ConnectivityMeterDetailPayload {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    typeof o.meter === "object" &&
    o.meter !== null &&
    typeof o.live === "object" &&
    o.live !== null &&
    Array.isArray(o.history) &&
    typeof o.derived === "object" &&
    o.derived !== null
  )
}

export function ConnectivityMeterDetailClient({
  initial,
  meterSlug,
}: {
  initial: ConnectivityMeterDetailPayload
  /** URL segment (registry id or serial) for refresh API. */
  meterSlug: string
}) {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/connectivity/meters/${encodeURIComponent(meterSlug)}`,
        { cache: "no-store" }
      )
      if (!res.ok) {
        setError("Could not refresh.")
        setLoading(false)
        return
      }
      const json: unknown = await res.json()
      if (!isDetailPayload(json)) {
        setError("Invalid response.")
        setLoading(false)
        return
      }
      setData(json)
    } catch {
      setError("Network error.")
    } finally {
      setLoading(false)
    }
  }, [meterSlug])

  const { meter, live, history, derived } = data
  const st = phase1LiveStatusPresentation(live.liveStatus)
  const reg = formatCommStatus(live.registryCommStatus)

  return (
    <div className={operationalListPageStackClass}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link href="/connectivity" className="font-medium text-foreground underline-offset-4 hover:underline">
          ← Overview
        </Link>
        <span aria-hidden>·</span>
        <Link href="/connectivity/events" className="underline-offset-4 hover:underline">
          Events
        </Link>
        <span aria-hidden>·</span>
        <Link
          href={`/meters?q=${encodeURIComponent(meter.serialNumber)}`}
          className="underline-offset-4 hover:underline"
        >
          Meters
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <SectionCard title="Registry">
        <DlGrid
          items={[
            { label: "Serial", value: <span className="font-mono">{meter.serialNumber}</span> },
            { label: "Internal ID", value: <span className="font-mono">{meter.id}</span> },
            { label: "Profile ref", value: meter.meterProfileId || "—" },
            { label: "Model", value: meter.model || "—" },
            { label: "Feeder", value: meter.feeder || "—" },
            { label: "Zone", value: meter.zone || "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Current connectivity">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
          <StatusBadge variant={reg.variant}>Registry: {reg.label}</StatusBadge>
          {derived.unstable ? (
            <StatusBadge variant="warning">Unstable (45m)</StatusBadge>
          ) : null}
        </div>
        <DlGrid
          items={[
            { label: "Last seen (surface)", value: live.lastSeenDisplay },
            { label: "Route / source", value: live.currentRoute },
            {
              label: "Remote / listener",
              value: (
                <span className="font-mono text-xs">
                  {live.remoteEndpoint ??
                    (live.listenerBindEndpoint
                      ? `Listener ${live.listenerBindEndpoint}`
                      : "—")}
                </span>
              ),
            },
            {
              label: "Bind",
              value:
                live.bindState === "bound"
                  ? "Bound"
                  : live.bindState === "pending_identity"
                    ? "Pending identity"
                    : "None",
            },
            {
              label: "Live session",
              value: live.hasLiveSession ? "Yes" : "No",
            },
            {
              label: "Last event",
              value: live.phase2?.lastEventType ?? "—",
            },
            {
              label: "Failures / 45m",
              value: String(live.phase2?.recentFailureCount ?? 0),
            },
          ]}
        />
      </SectionCard>

      <DetailBlock title="Derived (from stored events)">
        <DlGrid
          items={[
            { label: "Last connect", value: derived.lastConnectDisplay },
            { label: "Last disconnect", value: derived.lastDisconnectDisplay },
            { label: "Last restore", value: derived.lastRestoreDisplay },
            {
              label: "Last association failure",
              value: derived.lastAssociationFailureDisplay,
            },
            { label: "Last timeout", value: derived.lastTimeoutDisplay },
            {
              label: "Failures / 45m",
              value: String(derived.recentFailures45m),
            },
            {
              label: "Successes / 45m",
              value: String(derived.recentSuccesses45m),
            },
          ]}
        />
      </DetailBlock>

      <SectionCard title="Event history (this meter)">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stored events for this meter.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[168px]">Time</TableHead>
                  <TableHead className="w-[140px]">Event</TableHead>
                  <TableHead className="min-w-[220px]">Message</TableHead>
                  <TableHead className="w-[120px]">Route</TableHead>
                  <TableHead className="min-w-[140px]">Endpoint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((ev) => {
                  const ep =
                    ev.remoteHost && ev.remotePort != null
                      ? `${ev.remoteHost}:${ev.remotePort}`
                      : "—"
                  const sev = eventSeverityVariant(ev.severity)
                  return (
                    <TableRow key={ev.id}>
                      <TableCell className="align-top text-xs tabular-nums text-muted-foreground">
                        {formatOperatorDateTime(ev.createdAt)}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge variant={sev} className="font-mono text-[11px]">
                          {ev.eventType}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="align-top text-xs">
                        <div className="max-w-lg truncate" title={ev.message}>
                          {ev.message}
                        </div>
                      </TableCell>
                      <TableCell className="align-top font-mono text-[11px] text-muted-foreground">
                        {ev.route}
                      </TableCell>
                      <TableCell className="align-top font-mono text-[11px]">{ep}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
