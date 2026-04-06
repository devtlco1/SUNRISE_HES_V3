"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { useEffect, useMemo, useState, useCallback } from "react"

import { TableBodySkeleton } from "@/components/data-table/table-body-skeleton"
import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { MeterDetailsSheet } from "@/components/meters/meter-details-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { FilterSelect } from "@/components/shared/filter-select"
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
import { mockMeterListRows } from "@/lib/mock/meters"
import {
  formatAlarmState,
  formatCommStatus,
  formatPhaseType,
  formatRelayStatus,
} from "@/lib/meters/format"
import type { MeterListRow } from "@/types/meter"

const ALL = "all"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

function MeterTableHeaderRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="w-[200px] bg-muted/25">Meter</TableHead>
      <TableHead className="w-[120px] bg-muted/25">Serial No.</TableHead>
      <TableHead className="min-w-[200px] bg-muted/25">
        Location / Feeder
      </TableHead>
      <TableHead className="min-w-[160px] bg-muted/25">
        Manufacturer / Model
      </TableHead>
      <TableHead className="w-[110px] bg-muted/25">Comm</TableHead>
      <TableHead className="w-[110px] bg-muted/25">Relay</TableHead>
      <TableHead className="w-[128px] bg-muted/25">Last reading</TableHead>
      <TableHead className="w-[128px] bg-muted/25">Last comm</TableHead>
      <TableHead className="w-[100px] bg-muted/25">Alarm</TableHead>
      <TableHead className="w-[72px] bg-muted/25 text-right">Actions</TableHead>
    </TableRow>
  )
}

type MetersListProps = {
  /** Swap to `[]` in the page module to exercise the empty catalog state. */
  rows?: MeterListRow[]
}

function matchesSearch(row: MeterListRow, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.id,
    row.serialNumber,
    row.customerName,
    row.feeder,
    row.transformer,
    row.zone,
    row.manufacturer,
    row.model,
  ]
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function MetersList({ rows: sourceRows = mockMeterListRows }: MetersListProps) {
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [commFilter, setCommFilter] = useState<string>(ALL)
  const [manufacturerFilter, setManufacturerFilter] = useState<string>(ALL)
  const [relayFilter, setRelayFilter] = useState<string>(ALL)
  const [alarmFilter, setAlarmFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedMeter, setSelectedMeter] = useState<MeterListRow | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 380)
    return () => window.clearTimeout(t)
  }, [])

  const resetPage = useCallback(() => setPage(1), [])

  const manufacturerOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.manufacturer))
    return [
      { value: ALL, label: "All manufacturers" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((m) => ({ value: m, label: m })),
    ]
  }, [sourceRows])

  const filtered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (!matchesSearch(row, search)) return false
      if (commFilter !== ALL && row.commStatus !== commFilter) return false
      if (manufacturerFilter !== ALL && row.manufacturer !== manufacturerFilter)
        return false
      if (relayFilter !== ALL && row.relayStatus !== relayFilter) return false
      if (alarmFilter !== ALL && row.alarmState !== alarmFilter) return false
      return true
    })
  }, [
    sourceRows,
    search,
    commFilter,
    manufacturerFilter,
    relayFilter,
    alarmFilter,
  ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const filtersActive =
    search.trim() !== "" ||
    commFilter !== ALL ||
    manufacturerFilter !== ALL ||
    relayFilter !== ALL ||
    alarmFilter !== ALL

  function clearFilters() {
    setSearch("")
    setCommFilter(ALL)
    setManufacturerFilter(ALL)
    setRelayFilter(ALL)
    setAlarmFilter(ALL)
    resetPage()
  }

  function openDetails(meter: MeterListRow) {
    setSelectedMeter(meter)
    setSheetOpen(true)
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) setSelectedMeter(null)
  }

  const emptyCatalog = sourceRows.length === 0
  const noResults = !emptyCatalog && filtered.length === 0

  return (
    <>
      <FilterBar>
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="meter-filter-comm"
              label="Comm status"
              value={commFilter}
              onChange={(v) => {
                setCommFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All statuses" },
                { value: "online", label: "Online" },
                { value: "degraded", label: "Degraded" },
                { value: "offline", label: "Offline" },
                { value: "dormant", label: "Dormant" },
              ]}
            />
            <FilterSelect
              id="meter-filter-mfr"
              label="Manufacturer"
              value={manufacturerFilter}
              onChange={(v) => {
                setManufacturerFilter(v)
                resetPage()
              }}
              options={manufacturerOptions}
            />
            <FilterSelect
              id="meter-filter-relay"
              label="Relay status"
              value={relayFilter}
              onChange={(v) => {
                setRelayFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All relay states" },
                { value: "energized", label: "Energized" },
                { value: "open", label: "Open" },
                { value: "unknown", label: "Unknown" },
                { value: "test", label: "Test" },
              ]}
            />
            <FilterSelect
              id="meter-filter-alarm"
              label="Alarm"
              value={alarmFilter}
              onChange={(v) => {
                setAlarmFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All alarms" },
                { value: "none", label: "None" },
                { value: "warning", label: "Warning" },
                { value: "critical", label: "Critical" },
              ]}
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
        title="Meter registry"
        description="Operational list layout — filters and pagination are client-side mock only."
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
                  placeholder="Search ID, serial, customer, feeder, zone…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    resetPage()
                  }}
                  aria-label="Search meters"
                />
              </div>
            }
            right={
              <>
                <Button type="button" variant="outline" size="sm" disabled>
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
              <div className="min-w-[1040px]">
                <Table>
                  <TableHeader>
                    <MeterTableHeaderRow />
                  </TableHeader>
                  <TableBodySkeleton rows={6} columns={10} />
                </Table>
              </div>
            </div>
          ) : emptyCatalog || noResults ? null : (
            <div className="relative min-w-0">
              <div className="min-w-[1040px]">
                <Table>
                  <TableHeader>
                    <MeterTableHeaderRow />
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const comm = formatCommStatus(row.commStatus)
                      const relay = formatRelayStatus(row.relayStatus)
                      const alarm = formatAlarmState(row.alarmState)
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="align-top font-medium">
                            <button
                              type="button"
                              onClick={() => openDetails(row)}
                              className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              {row.id}
                            </button>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatPhaseType(row.phaseType)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {row.serialNumber}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="max-w-[220px] truncate text-foreground">
                              {row.customerName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.feeder} · {row.zone}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-foreground">{row.manufacturer}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.model}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={comm.variant}>
                              {comm.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={relay.variant}>
                              {relay.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {row.lastReadingAt}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {row.lastCommunicationAt}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={alarm.variant}>
                              {alarm.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                                aria-label={`Actions for ${row.serialNumber}`}
                              >
                                <MoreHorizontalIcon className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                  {row.serialNumber}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDetails(row)}
                                >
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View readings
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View connectivity
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Open commands
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View alarms
                                </DropdownMenuItem>
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

          {!loading && emptyCatalog ? (
            <TableEmpty
              title="No meters in registry"
              description="Import or register meters to populate this list. Swap mock data to an empty array to verify this state during development."
            />
          ) : null}

          {!loading && noResults ? (
            <TableEmpty
              title="No meters match the current filters"
              description="Try clearing search text or widening filter criteria."
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

      <MeterDetailsSheet
        meter={selectedMeter}
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
      />
    </>
  )
}
