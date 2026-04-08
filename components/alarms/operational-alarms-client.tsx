"use client"

import { OperationalAlarmDetailsSheet } from "@/components/alarms/operational-alarm-details-sheet"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { FilterSelect } from "@/components/shared/filter-select"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { operationalAlarmHref } from "@/lib/alarms/notification-filter"
import {
  formatOperationalSeverity,
  formatOperationalStatus,
} from "@/lib/alarms/operational-format"
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import { cn } from "@/lib/utils"
import type {
  NotificationPreferences,
  OperationalAlarmRecord,
  OperationalAlarmsSummary,
} from "@/types/operational-alarm"
import { SearchIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

const ALL = "all"
const POLL_MS = 12_000
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

type PagePayload = {
  alarms: OperationalAlarmRecord[]
  summary: OperationalAlarmsSummary
  preferences: NotificationPreferences
}

function matchesSearch(row: OperationalAlarmRecord, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.id,
    row.meterId,
    row.meterSerial,
    row.title,
    row.message,
    row.alarmType,
    row.sourceType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function OperationalAlarmsClient() {
  const [alarms, setAlarms] = useState<OperationalAlarmRecord[]>([])
  const [summary, setSummary] = useState<OperationalAlarmsSummary | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prefsSaving, setPrefsSaving] = useState(false)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [severityFilter, setSeverityFilter] = useState<string>(ALL)
  const [sourceFilter, setSourceFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<OperationalAlarmRecord | null>(null)
  const [clearingId, setClearingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/alarms", { cache: "no-store" })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as PagePayload
      setAlarms(data.alarms)
      setSummary(data.summary)
      setPreferences(data.preferences)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const sourceOptions = useMemo(() => {
    const set = new Set(alarms.map((a) => a.sourceType))
    return [
      { value: ALL, label: "All sources" },
      ...[...set]
        .sort()
        .map((v) => ({ value: v, label: v })),
    ]
  }, [alarms])

  const filtered = useMemo(() => {
    return alarms.filter((row) => {
      if (!matchesSearch(row, search)) return false
      if (statusFilter !== ALL && row.status !== statusFilter) return false
      if (severityFilter !== ALL && row.severity !== severityFilter) return false
      if (sourceFilter !== ALL && row.sourceType !== sourceFilter) return false
      return true
    })
  }, [alarms, search, statusFilter, severityFilter, sourceFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const resetPage = useCallback(() => setPage(1), [])

  async function patchPreferences(patch: Partial<NotificationPreferences>) {
    if (!preferences) return
    setPrefsSaving(true)
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error("Save failed")
      const next = (await res.json()) as NotificationPreferences
      setPreferences(next)
      await load()
    } catch {
      setError("Could not save notification preferences.")
    } finally {
      setPrefsSaving(false)
    }
  }

  async function clearAlarm(id: string) {
    setClearingId(id)
    try {
      const res = await fetch(
        `/api/alarms/${encodeURIComponent(id)}/clear`,
        { method: "POST" }
      )
      if (!res.ok) throw new Error("Clear failed")
      await load()
    } catch {
      setError("Could not clear alarm.")
    } finally {
      setClearingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Active alarms
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {summary?.activeCount ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Critical (active)
          </div>
          <div className="text-xl font-semibold tabular-nums text-destructive">
            {summary?.criticalActiveCount ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cleared (stored)
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {summary?.clearedCount ?? "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Active · hidden from header
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {summary?.suppressedNotificationCount ?? "—"}
          </div>
        </div>
      </div>

      <SectionCard
        title="Notification preferences"
        description="Controls what appears in the header bell. Alarms always remain listed here unless cleared; disabled types stay off the notification menu."
      >
        <div className="space-y-3 border-t border-border px-5 py-4 text-sm">
          {preferences ? (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.enableConnectivityNotifications}
                  disabled={prefsSaving}
                  onChange={(e) =>
                    void patchPreferences({
                      enableConnectivityNotifications: e.target.checked,
                    })
                  }
                />
                <span>Connectivity / association / identify alarms</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.enableRelayFailureNotifications}
                  disabled={prefsSaving}
                  onChange={(e) =>
                    void patchPreferences({
                      enableRelayFailureNotifications: e.target.checked,
                    })
                  }
                />
                <span>Relay failure alarms</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.enableReadFailureNotifications}
                  disabled={prefsSaving}
                  onChange={(e) =>
                    void patchPreferences({
                      enableReadFailureNotifications: e.target.checked,
                    })
                  }
                />
                <span>Read / data exchange failure alarms</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.enableCommandFailureNotifications}
                  disabled={prefsSaving}
                  onChange={(e) =>
                    void patchPreferences({
                      enableCommandFailureNotifications: e.target.checked,
                    })
                  }
                />
                <span>Command run failure alarms</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferences.criticalOnly}
                  disabled={prefsSaving}
                  onChange={(e) =>
                    void patchPreferences({ criticalOnly: e.target.checked })
                  }
                />
                <span>Header: critical severity only</span>
              </label>
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Minimum severity</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={preferences.minimumSeverity}
                  disabled={prefsSaving}
                  onChange={(e) =>
                    void patchPreferences({
                      minimumSeverity: e.target.value as NotificationPreferences["minimumSeverity"],
                    })
                  }
                >
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                  <option value="critical">critical</option>
                </select>
              </label>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Loading preferences…</p>
          )}
        </div>
      </SectionCard>

      <FilterBar>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id="opalm-status"
            label="Status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v)
              resetPage()
            }}
            options={[
              { value: ALL, label: "All" },
              { value: "active", label: "Active" },
              { value: "cleared", label: "Cleared" },
            ]}
          />
          <FilterSelect
            id="opalm-severity"
            label="Severity"
            value={severityFilter}
            onChange={(v) => {
              setSeverityFilter(v)
              resetPage()
            }}
            options={[
              { value: ALL, label: "All severities" },
              { value: "critical", label: "Critical" },
              { value: "warning", label: "Warning" },
              { value: "info", label: "Info" },
            ]}
          />
          <FilterSelect
            id="opalm-source"
            label="Source"
            value={sourceFilter}
            onChange={(v) => {
              setSourceFilter(v)
              resetPage()
            }}
            options={sourceOptions}
          />
        </div>
      </FilterBar>

      <SectionCard
        title="Operational alarms"
        description="Derived from connectivity events and command runs. Sync runs on each refresh."
      >
        <TableShell>
          <TableToolbar
            left={
              <div className="relative w-full min-w-[200px] max-w-sm flex-1">
                <SearchIcon
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="h-8 pl-8"
                  placeholder="Search serial, id, title, message…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    resetPage()
                  }}
                  aria-label="Search alarms"
                />
              </div>
            }
            right={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void load()}
              >
                Refresh
              </Button>
            }
          />

          {loading && alarms.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="relative min-w-0 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Severity</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Meter / serial</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const sev = formatOperationalSeverity(row.severity)
                    const st = formatOperationalStatus(row.status)
                    const href = operationalAlarmHref(row)
                    return (
                      <tr key={row.id} className="border-b border-border/80">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-xs text-muted-foreground">
                          {formatOperatorDateTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge variant={sev.variant}>{sev.label}</StatusBadge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.alarmType}
                        </td>
                        <td className="px-3 py-2 text-xs">{row.sourceType}</td>
                        <td className="max-w-[120px] truncate px-3 py-2 text-xs">
                          {row.meterSerial || row.meterId || "—"}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2 text-xs font-medium">
                          {row.title}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground"
                          title={row.message}
                        >
                          {row.message}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => {
                                setSelected(row)
                                setSheetOpen(true)
                              }}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              disabled={
                                row.status !== "active" || clearingId === row.id
                              }
                              onClick={() => void clearAlarm(row.id)}
                            >
                              Clear
                            </Button>
                            <Link
                              href={href}
                              className={cn(
                                buttonVariants({ variant: "ghost", size: "sm" }),
                                "h-7 px-2"
                              )}
                            >
                              Open
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filtered.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No alarms match the current filters.
            </p>
          ) : null}

          <TablePagination
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </TableShell>
      </SectionCard>

      <OperationalAlarmDetailsSheet
        alarm={selected}
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o)
          if (!o) setSelected(null)
        }}
      />
    </div>
  )
}
