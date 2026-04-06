"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { ConnectivityDetailsSheet } from "@/components/connectivity/connectivity-details-sheet"
import { TableBodySkeleton } from "@/components/data-table/table-body-skeleton"
import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
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
import { formatHealthState } from "@/lib/connectivity/format"
import { mockConnectivityListRows } from "@/lib/mock/connectivity"
import {
  operationalListPageStackClass,
  operationalMonoIdTriggerClass,
  operationalRowActionTriggerClass,
} from "@/lib/ui/operational"
import { formatCommStatus } from "@/lib/meters/format"
import type { ConnectivityListRow } from "@/types/connectivity"

const ALL = "all"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

function ConnectivityTableHeaderRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="w-[168px]">Meter</TableHead>
      <TableHead className="w-[120px]">Serial No.</TableHead>
      <TableHead className="min-w-[160px]">Network / Route</TableHead>
      <TableHead className="w-[104px]">Comm Status</TableHead>
      <TableHead className="w-[100px]">Health</TableHead>
      <TableHead className="w-[128px]">Last Communication</TableHead>
      <TableHead className="w-[128px]">Last Successful Read</TableHead>
      <TableHead className="min-w-[140px]">Signal / Quality</TableHead>
      <TableHead className="min-w-[180px]">Endpoint / Gateway</TableHead>
      <TableHead className="w-[72px] text-right">Actions</TableHead>
    </TableRow>
  )
}

type ConnectivityListProps = {
  rows?: ConnectivityListRow[]
}

function matchesSearch(row: ConnectivityListRow, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.id,
    row.serialNumber,
    row.networkType,
    row.routeId,
    row.gatewayId,
    row.endpoint,
    row.protocolVersion,
  ]
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function ConnectivityList({
  rows: sourceRows = mockConnectivityListRows,
}: ConnectivityListProps) {
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [commFilter, setCommFilter] = useState<string>(ALL)
  const [networkFilter, setNetworkFilter] = useState<string>(ALL)
  const [gatewayFilter, setGatewayFilter] = useState<string>(ALL)
  const [healthFilter, setHealthFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<ConnectivityListRow | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 380)
    return () => window.clearTimeout(t)
  }, [])

  const resetPage = useCallback(() => setPage(1), [])

  const networkOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.networkType))
    return [
      { value: ALL, label: "All network types" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const gatewayOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.gatewayId))
    return [
      { value: ALL, label: "All gateways / DCUs" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const filtered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (!matchesSearch(row, search)) return false
      if (commFilter !== ALL && row.commState !== commFilter) return false
      if (networkFilter !== ALL && row.networkType !== networkFilter)
        return false
      if (gatewayFilter !== ALL && row.gatewayId !== gatewayFilter) return false
      if (healthFilter !== ALL && row.healthState !== healthFilter) return false
      return true
    })
  }, [
    sourceRows,
    search,
    commFilter,
    networkFilter,
    gatewayFilter,
    healthFilter,
  ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const filtersActive =
    search.trim() !== "" ||
    commFilter !== ALL ||
    networkFilter !== ALL ||
    gatewayFilter !== ALL ||
    healthFilter !== ALL

  function clearFilters() {
    setSearch("")
    setCommFilter(ALL)
    setNetworkFilter(ALL)
    setGatewayFilter(ALL)
    setHealthFilter(ALL)
    resetPage()
  }

  function openDetails(row: ConnectivityListRow) {
    setSelected(row)
    setSheetOpen(true)
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) setSelected(null)
  }

  const emptyCatalog = sourceRows.length === 0
  const noResults = !emptyCatalog && filtered.length === 0

  return (
    <div className={operationalListPageStackClass}>
      <FilterBar>
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="conn-filter-comm"
              label="Communication status"
              value={commFilter}
              onChange={(v) => {
                setCommFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All comm states" },
                { value: "online", label: "Online" },
                { value: "degraded", label: "Degraded" },
                { value: "offline", label: "Offline" },
                { value: "dormant", label: "Dormant" },
              ]}
            />
            <FilterSelect
              id="conn-filter-net"
              label="Network type"
              value={networkFilter}
              onChange={(v) => {
                setNetworkFilter(v)
                resetPage()
              }}
              options={networkOptions}
            />
            <FilterSelect
              id="conn-filter-gw"
              label="Gateway / DCU"
              value={gatewayFilter}
              onChange={(v) => {
                setGatewayFilter(v)
                resetPage()
              }}
              options={gatewayOptions}
            />
            <FilterSelect
              id="conn-filter-health"
              label="Health state"
              value={healthFilter}
              onChange={(v) => {
                setHealthFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All health states" },
                { value: "healthy", label: "Healthy" },
                { value: "degraded", label: "Degraded" },
                { value: "failed", label: "Failed" },
                { value: "unknown", label: "Unknown" },
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
        title="Communication endpoints"
        description="Per-meter routes, gateways, and session posture. Values are mock telemetry for layout review."
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
                  placeholder="Search meter, serial, route, gateway, endpoint…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    resetPage()
                  }}
                  aria-label="Search connectivity"
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
              <div className="min-w-[1180px]">
                <Table>
                  <TableHeader>
                    <ConnectivityTableHeaderRow />
                  </TableHeader>
                  <TableBodySkeleton rows={6} columns={10} />
                </Table>
              </div>
            </div>
          ) : emptyCatalog || noResults ? null : (
            <div className="relative min-w-0">
              <div className="min-w-[1180px]">
                <Table>
                  <TableHeader>
                    <ConnectivityTableHeaderRow />
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const comm = formatCommStatus(row.commState)
                      const health = formatHealthState(row.healthState)
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
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {row.serialNumber}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="max-w-[200px] truncate text-foreground">
                              {row.networkType}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.routeId}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={comm.variant}>
                              {comm.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={health.variant}>
                              {health.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {row.lastCommunicationAt}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {row.lastSuccessfulReadAt}
                          </TableCell>
                          <TableCell className="align-top text-sm text-foreground">
                            {row.signalQuality}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="max-w-[220px] truncate font-mono text-xs text-foreground">
                              {row.endpoint}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.gatewayId}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={operationalRowActionTriggerClass}
                                aria-label={`Actions for ${row.serialNumber}`}
                              >
                                <MoreHorizontalIcon className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
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
                                  View route
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View reads
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Open commands
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View diagnostics
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
              title="No connectivity endpoints"
              description="Registered communication paths will list here. Use an empty rows prop to verify this layout."
            />
          ) : null}

          {!loading && noResults ? (
            <TableEmpty
              title="No endpoints match filters"
              description="Clear filters or widen communication, network, and health criteria."
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

      <ConnectivityDetailsSheet
        row={selected}
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
      />
    </div>
  )
}
