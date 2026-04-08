"use client"

import { AlertCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { TableShell } from "@/components/data-table/table-shell"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
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
  DASHBOARD_FETCH_NETWORK_ERROR,
  fetchDashboard,
} from "@/lib/dashboard/api"
import { formatAlarmSeverity } from "@/lib/alarms/format"
import { formatQueueState } from "@/lib/commands/format"
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import type { DashboardSnapshot } from "@/types/dashboard"

function StatGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-[7.25rem] animate-pulse rounded-lg border border-border bg-muted/25"
        />
      ))}
    </div>
  )
}

function SectionsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-lg border border-border bg-muted/25" />
        <div className="h-72 animate-pulse rounded-lg border border-border bg-muted/25" />
      </div>
      <div className="h-52 animate-pulse rounded-lg border border-border bg-muted/25" />
    </div>
  )
}

export function DashboardHomeClient() {
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    let stale = false

    fetchDashboard(ac.signal)
      .then((result) => {
        if (stale) return
        setLoading(false)
        if (!result.ok) {
          setError(result.error)
          setSnapshot(null)
          return
        }
        setError(null)
        setSnapshot(result.snapshot)
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return
        if (stale) return
        setLoading(false)
        setError(DASHBOARD_FETCH_NETWORK_ERROR)
        setSnapshot(null)
      })

    return () => {
      stale = true
      ac.abort()
    }
  }, [loadKey])

  function reload() {
    setLoading(true)
    setError(null)
    setLoadKey((k) => k + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Aggregated from read-only meter, connectivity, alarm, and command job catalogs. Pending commands counts in-flight queue states and open meter work."
      />

      {loading ? (
        <>
          <StatGridSkeleton />
          <SectionsSkeleton />
        </>
      ) : null}

      {!loading && error ? (
        <EmptyState
          title="Unable to load dashboard summary"
          description={error}
          icon={<AlertCircleIcon className="size-5" aria-hidden />}
          action={
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          }
          className="border-solid bg-card"
        />
      ) : null}

      {!loading && !error && snapshot ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.stats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                description={stat.description}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Recent activity"
              description="Derived from alarm last seen and connectivity last communication timestamps in the current catalogs."
            >
              {snapshot.activity.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
                  No activity entries could be derived from the current catalogs.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {snapshot.activity.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-sm text-foreground">{item.summary}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {item.tone === "success" ? (
                          <StatusBadge variant="success">OK</StatusBadge>
                        ) : null}
                        {item.tone === "warning" ? (
                          <StatusBadge variant="warning">Watch</StatusBadge>
                        ) : null}
                        {item.tone === "neutral" ? (
                          <StatusBadge variant="neutral">Info</StatusBadge>
                        ) : null}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatOperatorDateTime(item.occurredAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Recent alarms"
              description="Latest rows by last seen from the read-only alarm catalog."
            >
              <TableShell>
                {snapshot.recentAlarms.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No alarms in the current catalog.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Alarm</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Meter</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead className="text-right">Last seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.recentAlarms.map((row) => {
                        const sev = formatAlarmSeverity(row.severity)
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="max-w-[120px] truncate font-mono text-sm font-medium">
                              {row.id}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-sm text-foreground">
                              {row.alarmType}
                            </TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {row.meterSerial}
                            </TableCell>
                            <TableCell>
                              <StatusBadge variant={sev.variant}>
                                {sev.label}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {formatOperatorDateTime(row.lastSeen)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </TableShell>
            </SectionCard>
          </div>

          <SectionCard
            title="Recent command jobs"
            description="Latest submissions by submitted-at from the read-only command job catalog."
          >
            <TableShell>
              {snapshot.recentCommandJobs.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No command jobs in the current catalog.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Job</TableHead>
                      <TableHead>Command</TableHead>
                      <TableHead>Queue state</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                      <TableHead className="min-w-[140px]">Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.recentCommandJobs.map((row) => {
                      const q = formatQueueState(row.queueState)
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="max-w-[148px] truncate font-mono text-sm font-medium">
                            {row.id}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-foreground">
                            {row.templateName}
                          </TableCell>
                          <TableCell>
                            <StatusBadge variant={q.variant}>{q.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatOperatorDateTime(row.submittedAt)}
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-sm text-foreground">
                            {row.resultSummary}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </TableShell>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
