"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { AlarmDetailsSheet } from "@/components/alarms/alarm-details-sheet"
import { TableBodySkeleton } from "@/components/data-table/table-body-skeleton"
import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { FilterSelect } from "@/components/shared/filter-select"
import { OperationalActionStrip } from "@/components/shared/operational-action-strip"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  ALARMS_FETCH_NETWORK_ERROR,
  fetchAlarms,
} from "@/lib/alarms/api"
import {
  formatAlarmAck,
  formatAlarmSeverity,
  formatAlarmState,
} from "@/lib/alarms/format"
import {
  operationalListPageStackClass,
  operationalMonoIdTriggerClass,
  operationalRowActionTriggerClass,
} from "@/lib/ui/operational"
import type { AlarmListRow } from "@/types/alarm"

const ALL = "all"
const UNASSIGNED = "unassigned"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

function AlarmsTableHeaderRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="w-[120px]">Alarm</TableHead>
      <TableHead className="min-w-[140px]">Meter / Serial</TableHead>
      <TableHead className="min-w-[200px]">Location / Feeder</TableHead>
      <TableHead className="min-w-[140px]">Type</TableHead>
      <TableHead className="w-[92px]">Severity</TableHead>
      <TableHead className="w-[112px]">State</TableHead>
      <TableHead className="w-[120px]">First Seen</TableHead>
      <TableHead className="w-[120px]">Last Seen</TableHead>
      <TableHead className="w-[72px] text-right">Count</TableHead>
      <TableHead className="w-[130px]">Acknowledgement</TableHead>
      <TableHead className="w-[72px] text-right">Actions</TableHead>
    </TableRow>
  )
}

type AlarmsListProps = {
  /**
   * When provided, skips `/api/alarms` (e.g. `NEXT_PUBLIC_ALARMS_USE_MOCK` or tests).
   * Pass `[]` to exercise an empty catalog without the API.
   */
  rows?: AlarmListRow[]
}

function matchesSearch(row: AlarmListRow, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.id,
    row.meterId,
    row.serialNumber,
    row.customerName,
    row.feeder,
    row.zone,
    row.alarmType,
    row.summary,
    row.sourceDomain,
  ]
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function AlarmsList({ rows: rowsProp }: AlarmsListProps) {
  const staticMode = rowsProp !== undefined
  const [fetchedRows, setFetchedRows] = useState<AlarmListRow[]>([])
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(rowsProp === undefined)
  const [error, setError] = useState<string | null>(null)

  const sourceRows = rowsProp !== undefined ? rowsProp : fetchedRows

  const [search, setSearch] = useState("")
  const [severityFilter, setSeverityFilter] = useState<string>(ALL)
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [stateFilter, setStateFilter] = useState<string>(ALL)
  const [ackFilter, setAckFilter] = useState<string>(ALL)
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<AlarmListRow | null>(null)

  useEffect(() => {
    if (staticMode) return

    const ac = new AbortController()
    let stale = false

    fetchAlarms(ac.signal)
      .then((result) => {
        if (stale) return
        setLoading(false)
        if (!result.ok) {
          setError(result.error)
          setFetchedRows([])
          return
        }
        setError(null)
        setFetchedRows(result.rows)
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return
        if (stale) return
        setLoading(false)
        setError(ALARMS_FETCH_NETWORK_ERROR)
        setFetchedRows([])
      })

    return () => {
      stale = true
      ac.abort()
    }
  }, [staticMode, loadKey])

  function reload() {
    if (staticMode) return
    setLoading(true)
    setError(null)
    setLoadKey((k) => k + 1)
  }

  const resetPage = useCallback(() => setPage(1), [])

  const typeOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.alarmType))
    return [
      { value: ALL, label: "All alarm types" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const assigneeOptions = useMemo(() => {
    const set = new Set(
      sourceRows.map((r) => r.assignedTo).filter(Boolean) as string[]
    )
    return [
      { value: ALL, label: "All assignees" },
      { value: UNASSIGNED, label: "Unassigned" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const filtered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (!matchesSearch(row, search)) return false
      if (severityFilter !== ALL && row.severity !== severityFilter) return false
      if (typeFilter !== ALL && row.alarmType !== typeFilter) return false
      if (stateFilter !== ALL && row.state !== stateFilter) return false
      if (ackFilter !== ALL && row.ackState !== ackFilter) return false
      if (assigneeFilter === UNASSIGNED && row.assignedTo !== null)
        return false
      if (
        assigneeFilter !== ALL &&
        assigneeFilter !== UNASSIGNED &&
        row.assignedTo !== assigneeFilter
      )
        return false
      return true
    })
  }, [
    sourceRows,
    search,
    severityFilter,
    typeFilter,
    stateFilter,
    ackFilter,
    assigneeFilter,
  ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const filtersActive =
    search.trim() !== "" ||
    severityFilter !== ALL ||
    typeFilter !== ALL ||
    stateFilter !== ALL ||
    ackFilter !== ALL ||
    assigneeFilter !== ALL

  function clearFilters() {
    setSearch("")
    setSeverityFilter(ALL)
    setTypeFilter(ALL)
    setStateFilter(ALL)
    setAckFilter(ALL)
    setAssigneeFilter(ALL)
    resetPage()
  }

  function openDetails(row: AlarmListRow) {
    setSelected(row)
    setSheetOpen(true)
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) setSelected(null)
  }

  const fetchFailed = !staticMode && !loading && error !== null
  const emptyCatalog = !fetchFailed && sourceRows.length === 0
  const noResults =
    !fetchFailed && !emptyCatalog && filtered.length === 0

  return (
    <div className={operationalListPageStackClass}>
      <OperationalActionStrip label="Triage">
        <Button type="button" size="sm" disabled>
          Acknowledge selected
        </Button>
        <Button type="button" size="sm" variant="outline" disabled>
          Assign selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={clearFilters}
          disabled={!filtersActive}
        >
          Clear filters
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled>
          Export
        </Button>
      </OperationalActionStrip>

      <FilterBar>
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <FilterSelect
              id="alm-filter-severity"
              label="Severity"
              value={severityFilter}
              onChange={(v) => {
                setSeverityFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All severities" },
                { value: "critical", label: "Critical" },
                { value: "major", label: "Major" },
                { value: "minor", label: "Minor" },
                { value: "warning", label: "Warning" },
                { value: "info", label: "Info" },
              ]}
            />
            <FilterSelect
              id="alm-filter-type"
              label="Alarm type"
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(v)
                resetPage()
              }}
              options={typeOptions}
            />
            <FilterSelect
              id="alm-filter-state"
              label="State"
              value={stateFilter}
              onChange={(v) => {
                setStateFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All states" },
                { value: "open", label: "Open" },
                { value: "acknowledged", label: "Acknowledged" },
                { value: "in_progress", label: "In progress" },
                { value: "cleared", label: "Cleared" },
                { value: "suppressed", label: "Suppressed" },
              ]}
            />
            <FilterSelect
              id="alm-filter-ack"
              label="Acknowledgement"
              value={ackFilter}
              onChange={(v) => {
                setAckFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All" },
                { value: "unacknowledged", label: "Unacknowledged" },
                { value: "acknowledged", label: "Acknowledged" },
                { value: "assigned", label: "Assigned" },
              ]}
            />
            <FilterSelect
              id="alm-filter-assignee"
              label="Assigned to"
              value={assigneeFilter}
              onChange={(v) => {
                setAssigneeFilter(v)
                resetPage()
              }}
              options={assigneeOptions}
            />
          </div>
          {filtersActive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </FilterBar>

      <SectionCard
        title="Active alarms"
        description={
          staticMode
            ? "Static catalog — filters and pagination run client-side."
            : "Served from GET /api/alarms. Filters and pagination run client-side on the fetched row set."
        }
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
                  placeholder="Search alarm ID, meter, site, type, summary…"
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
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={staticMode || loading}
                  onClick={reload}
                >
                  Refresh
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled>
                  Columns
                </Button>
              </>
            }
          />

          {loading ? (
            <div className="relative min-w-0">
              <div className="min-w-[1280px]">
                <Table>
                  <TableHeader>
                    <AlarmsTableHeaderRow />
                  </TableHeader>
                  <TableBodySkeleton rows={6} columns={11} />
                </Table>
              </div>
            </div>
          ) : fetchFailed ? null : emptyCatalog || noResults ? null : (
            <div className="relative min-w-0">
              <div className="min-w-[1280px]">
                <Table>
                  <TableHeader>
                    <AlarmsTableHeaderRow />
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const sev = formatAlarmSeverity(row.severity)
                      const st = formatAlarmState(row.state)
                      const ack = formatAlarmAck(row.ackState)
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="align-top">
                            <button
                              type="button"
                              onClick={() => openDetails(row)}
                              className={operationalMonoIdTriggerClass}
                            >
                              {row.id}
                            </button>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-sm font-medium text-foreground">
                              {row.meterId}
                            </div>
                            <div className="tabular-nums text-xs text-muted-foreground">
                              {row.serialNumber}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="max-w-[220px] truncate text-sm text-foreground">
                              {row.customerName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.feeder} · {row.zone}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {row.alarmType}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={sev.variant}>{sev.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-xs text-muted-foreground">
                            {formatOperatorDateTime(row.firstSeen)}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-xs text-muted-foreground">
                            {formatOperatorDateTime(row.lastSeen)}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums text-sm text-foreground">
                            {row.occurrenceCount}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={ack.variant}>{ack.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={operationalRowActionTriggerClass}
                                aria-label={`Actions for ${row.id}`}
                              >
                                <MoreHorizontalIcon className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
                                  {row.id}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDetails(row)}
                                >
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>View meter</DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View connectivity
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Open commands
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Acknowledge
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>Assign</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {!loading && fetchFailed ? (
            <TableEmpty
              title="Unable to load catalog"
              description={error ?? "Request failed."}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reload}
                >
                  Retry
                </Button>
              }
            />
          ) : null}

          {!loading && !fetchFailed && emptyCatalog ? (
            <TableEmpty
              title="No active alarms"
              description={
                staticMode
                  ? "Use an empty rows prop to verify this layout."
                  : "The catalog source returned no rows. If this is unexpected, verify data/alarms.json or the upstream feed."
              }
            />
          ) : null}

          {!loading && !fetchFailed && noResults ? (
            <TableEmpty
              title="No alarms match filters"
              description="Clear filters or widen severity, state, and assignment criteria."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              }
            />
          ) : null}

          <TablePagination
            page={currentPage}
            pageSize={pageSize}
            total={filtered.length}
            onPrevious={() => setPage(Math.max(1, currentPage - 1))}
            onNext={() => setPage(Math.min(totalPages, currentPage + 1))}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </TableShell>
      </SectionCard>

      <AlarmDetailsSheet
        alarm={selected}
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
      />
    </div>
  )
}
