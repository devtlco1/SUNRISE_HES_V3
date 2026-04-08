"use client"

import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { TableBodySkeleton } from "@/components/data-table/table-body-skeleton"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/shared/filter-select"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchConnectivityEventsHistory } from "@/lib/connectivity-events/fetch-history"
import { formatOperatorUtc } from "@/lib/format/operator-datetime"
import { operationalListPageStackClass } from "@/lib/ui/operational"
import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import {
  CONNECTIVITY_EVENT_TYPES_LIST,
  type ConnectivityEventRecord,
} from "@/types/connectivity-events"

const ALL = "all"

function eventSeverityVariant(s: ConnectivityEventRecord["severity"]): StatusBadgeVariant {
  if (s === "error") return "danger"
  if (s === "warning") return "warning"
  return "neutral"
}

export function ConnectivityEventsPage() {
  const [rows, setRows] = useState<Omit<ConnectivityEventRecord, "dedupeKey">[]>([])
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [failuresOnly, setFailuresOnly] = useState(false)
  const [serial, setSerial] = useState("")
  const [debouncedSerial, setDebouncedSerial] = useState("")
  const [eventType, setEventType] = useState<string>(ALL)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSerial(serial.trim()), 400)
    return () => window.clearTimeout(t)
  }, [serial])

  const reload = useCallback(() => setLoadKey((k) => k + 1), [])

  useEffect(() => {
    const ac = new AbortController()
    let stale = false
    setLoading(true)
    setError(null)

    fetchConnectivityEventsHistory({
      limit: 100,
      failuresOnly,
      serial: debouncedSerial || undefined,
      eventType: eventType !== ALL ? eventType : undefined,
      signal: ac.signal,
    })
      .then((r) => {
        if (stale) return
        setLoading(false)
        if (!r.ok) {
          setError(r.error)
          setRows([])
          return
        }
        setRows(r.events)
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return
        if (stale) return
        setLoading(false)
        setError("Network error.")
        setRows([])
      })

    return () => {
      stale = true
      ac.abort()
    }
  }, [loadKey, failuresOnly, debouncedSerial, eventType])

  const typeOptions = [
    { value: ALL, label: "All types" },
    ...CONNECTIVITY_EVENT_TYPES_LIST.map((t) => ({ value: t, label: t })),
  ]

  return (
    <div className={operationalListPageStackClass}>
      <p className="text-xs text-muted-foreground">
        <Link href="/connectivity" className="font-medium text-foreground underline-offset-4 hover:underline">
          ← Connectivity overview
        </Link>
      </p>

      <SectionCard title="Connectivity events">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <FilterSelect
            id="ce-filter-scope"
            label="Scope"
            value={failuresOnly ? "failures" : "all"}
            onChange={(v) => setFailuresOnly(v === "failures")}
            options={[
              { value: "all", label: "All events" },
              { value: "failures", label: "Failures only" },
            ]}
          />
          <div className="w-full min-w-[12rem] max-w-xs">
            <label
              htmlFor="ce-serial"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Serial contains
            </label>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="ce-serial"
                className="h-8 pl-8"
                placeholder="Filter by serial…"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </div>
          </div>
          <FilterSelect
            id="ce-filter-type"
            label="Event type"
            value={eventType}
            onChange={setEventType}
            options={typeOptions}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={loading}
            onClick={reload}
          >
            Refresh
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="min-w-[720px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[168px]">Time (UTC)</TableHead>
                  <TableHead className="w-[120px]">Meter</TableHead>
                  <TableHead className="w-[140px]">Event</TableHead>
                  <TableHead className="min-w-[200px]">Message</TableHead>
                  <TableHead className="w-[120px]">Route</TableHead>
                  <TableHead className="min-w-[140px]">Endpoint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBodySkeleton rows={8} columns={6} />
            </Table>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events in view.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[168px]">Time (UTC)</TableHead>
                  <TableHead className="w-[120px]">Meter</TableHead>
                  <TableHead className="w-[140px]">Event</TableHead>
                  <TableHead className="min-w-[200px]">Message</TableHead>
                  <TableHead className="w-[120px]">Route</TableHead>
                  <TableHead className="min-w-[140px]">Endpoint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((ev) => {
                  const ep =
                    ev.remoteHost && ev.remotePort != null
                      ? `${ev.remoteHost}:${ev.remotePort}`
                      : "—"
                  const sev = eventSeverityVariant(ev.severity)
                  return (
                    <TableRow key={ev.id}>
                      <TableCell className="align-top text-xs tabular-nums text-muted-foreground">
                        {formatOperatorUtc(ev.createdAt)}
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs">
                        {(() => {
                          const ref =
                            ev.meterId?.trim() || ev.meterSerial?.trim() || ""
                          const label = ev.meterSerial?.trim() || ref || "—"
                          if (!ref) return "—"
                          return (
                            <Link
                              href={`/connectivity/meters/${encodeURIComponent(ref)}`}
                              className="text-foreground underline-offset-4 hover:underline"
                            >
                              {label}
                            </Link>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge variant={sev} className="font-mono text-[11px]">
                          {ev.eventType}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="align-top text-xs">
                        <div className="max-w-md truncate" title={ev.message}>
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
