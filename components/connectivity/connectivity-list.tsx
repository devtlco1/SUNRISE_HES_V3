"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { TableBodySkeleton } from "@/components/data-table/table-body-skeleton"
import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { FilterSelect } from "@/components/shared/filter-select"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
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
import {
  CONNECTIVITY_FETCH_NETWORK_ERROR,
  fetchConnectivityPhase1,
} from "@/lib/connectivity/api"
import { PHASE1_REGISTRY_RECENT_MS } from "@/lib/connectivity/phase1-constants"
import { formatCommStatus } from "@/lib/meters/format"
import {
  operationalListPageStackClass,
  operationalMonoIdTriggerClass,
  operationalRowActionTriggerClass,
} from "@/lib/ui/operational"
import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type {
  ConnectivityPhase1LiveStatus,
  ConnectivityPhase1Row,
  ConnectivityPhase1Summary,
} from "@/types/connectivity"

const ALL = "all"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

function liveStatusBadge(
  s: ConnectivityPhase1LiveStatus
): { label: string; variant: StatusBadgeVariant } {
  switch (s) {
    case "live_inbound":
      return { label: "Live (inbound)", variant: "success" }
    case "online_recent_registry":
      return { label: "Online (recent)", variant: "success" }
    case "offline":
      return { label: "Offline", variant: "danger" }
    case "never_seen_registry":
      return { label: "Never seen", variant: "neutral" }
    case "unknown_live":
      return { label: "Unknown", variant: "warning" }
    default:
      return { label: s, variant: "neutral" }
  }
}

function ConnectivityTableHeaderRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="w-[120px]">Serial</TableHead>
      <TableHead className="w-[120px]">Meter ID</TableHead>
      <TableHead className="min-w-[100px]">Model</TableHead>
      <TableHead className="min-w-[100px]">Feeder / zone</TableHead>
      <TableHead className="w-[132px]">Status</TableHead>
      <TableHead className="w-[128px]">Last seen</TableHead>
      <TableHead className="min-w-[120px]">Route</TableHead>
      <TableHead className="min-w-[120px]">Remote / bind</TableHead>
      <TableHead className="min-w-[100px]">Registry comm</TableHead>
      <TableHead className="w-[72px] text-right">Actions</TableHead>
    </TableRow>
  )
}

function matchesSearch(row: ConnectivityPhase1Row, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.meterId,
    row.serialNumber,
    row.internalId,
    row.model,
    row.feeder,
    row.zone,
    row.meterProfileId,
    row.currentRoute,
    row.remoteEndpoint ?? "",
    row.statusReason,
  ]
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function ConnectivityList() {
  const router = useRouter()
  const [data, setData] = useState<{
    summary: ConnectivityPhase1Summary
    rows: ConnectivityPhase1Row[]
  } | null>(null)
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    const ac = new AbortController()
    let stale = false

    fetchConnectivityPhase1(ac.signal)
      .then((result) => {
        if (stale) return
        setLoading(false)
        if (!result.ok) {
          setError(result.error)
          setData(null)
          return
        }
        setError(null)
        setData({ summary: result.data.summary, rows: result.data.rows })
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return
        if (stale) return
        setLoading(false)
        setError(CONNECTIVITY_FETCH_NETWORK_ERROR)
        setData(null)
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

  const resetPage = useCallback(() => setPage(1), [])

  const sourceRows = data?.rows ?? []

  const filtered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (!matchesSearch(row, search)) return false
      if (statusFilter !== ALL && row.liveStatus !== statusFilter) return false
      return true
    })
  }, [sourceRows, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const filtersActive = search.trim() !== "" || statusFilter !== ALL

  function clearFilters() {
    setSearch("")
    setStatusFilter(ALL)
    resetPage()
  }

  const fetchFailed = !loading && error !== null
  const emptyCatalog = !fetchFailed && !loading && sourceRows.length === 0
  const noResults =
    !fetchFailed && !emptyCatalog && filtered.length === 0

  const summary = data?.summary

  return (
    <div className={operationalListPageStackClass}>
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total meters" value={summary.totalMeters.toLocaleString()} />
          <StatCard
            label="Online"
            value={summary.onlineMeters.toLocaleString()}
            description={
              summary.listenerFetchFailed
                ? "— (listener unavailable)"
                : "Inbound + recent registry"
            }
          />
          <StatCard label="Offline" value={summary.offlineMeters.toLocaleString()} />
          <StatCard
            label="Live inbound"
            value={summary.liveInboundMeters.toLocaleString()}
          />
          <StatCard
            label="Sessions (staged)"
            value={summary.stagedSessionCount.toLocaleString()}
          />
          <StatCard
            label="Never seen"
            value={summary.neverSeenMeters.toLocaleString()}
          />
        </div>
      ) : null}

      <FilterBar>
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect
              id="conn-filter-status"
              label="Connectivity status"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All statuses" },
                { value: "live_inbound", label: "Live (inbound)" },
                { value: "online_recent_registry", label: "Online (recent registry)" },
                { value: "offline", label: "Offline" },
                { value: "never_seen_registry", label: "Never seen" },
                { value: "unknown_live", label: "Unknown (listener)" },
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
        title="Meters — live connectivity"
        description={`Registry + TCP listener. Recent registry window: ${PHASE1_REGISTRY_RECENT_MS / 60000} min UTC.`}
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
                  placeholder="Search serial, ID, feeder, route…"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={reload}
              >
                Refresh
              </Button>
            }
          />

          {loading ? (
            <div className="relative min-w-0">
              <div className="min-w-[960px]">
                <Table>
                  <TableHeader>
                    <ConnectivityTableHeaderRow />
                  </TableHeader>
                  <TableBodySkeleton rows={6} columns={10} />
                </Table>
              </div>
            </div>
          ) : fetchFailed ? null : emptyCatalog || noResults ? null : (
            <div className="relative min-w-0">
              <div className="min-w-[960px]">
                <Table>
                  <TableHeader>
                    <ConnectivityTableHeaderRow />
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const st = liveStatusBadge(row.liveStatus)
                      const reg = formatCommStatus(row.registryCommStatus)
                      const bindLabel =
                        row.bindState === "bound"
                          ? "Bound"
                          : row.bindState === "pending_identity"
                            ? "Pending bind"
                            : "—"
                      const remoteOrBind =
                        row.remoteEndpoint ??
                        (row.listenerBindEndpoint
                          ? `Listener ${row.listenerBindEndpoint}`
                          : "—")
                      return (
                        <TableRow key={row.meterId}>
                          <TableCell className="align-top font-mono text-sm tabular-nums">
                            {row.serialNumber}
                          </TableCell>
                          <TableCell className="align-top">
                            <Link
                              href={`/meters?q=${encodeURIComponent(row.serialNumber)}`}
                              className={operationalMonoIdTriggerClass}
                            >
                              {row.internalId}
                            </Link>
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            <div className="max-w-[140px] truncate">{row.model || "—"}</div>
                            {row.meterProfileId ? (
                              <div className="font-mono text-xs text-muted-foreground">
                                {row.meterProfileId}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            <div className="max-w-[160px] truncate">{row.feeder || "—"}</div>
                            <div className="text-xs text-muted-foreground">{row.zone || "—"}</div>
                          </TableCell>
                          <TableCell className="align-top" title={row.statusReason}>
                            <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="align-top text-sm tabular-nums text-muted-foreground">
                            {row.lastSeenDisplay}
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            <div className="max-w-[180px] truncate">{row.currentRoute}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.lastSeenSource === "inbound_session"
                                ? "Session time"
                                : row.lastSeenSource === "registry"
                                  ? "Registry time"
                                  : "—"}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            <div className="font-mono text-xs">{remoteOrBind}</div>
                            <div className="text-xs text-muted-foreground">{bindLabel}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={reg.variant}>{reg.label}</StatusBadge>
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
                                  onClick={() =>
                                    router.push(
                                      `/meters?q=${encodeURIComponent(row.serialNumber)}`
                                    )
                                  }
                                >
                                  Open meter
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push(
                                      `/readings?meter=${encodeURIComponent(row.serialNumber)}`
                                    )
                                  }
                                >
                                  Open readings
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push("/scanner")}>
                                  Open scanner
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

          {!loading && fetchFailed ? (
            <TableEmpty
              title="Unable to load connectivity"
              description={error ?? "Request failed."}
              action={
                <Button type="button" variant="outline" size="sm" onClick={reload}>
                  Retry
                </Button>
              }
            />
          ) : null}

          {!loading && !fetchFailed && emptyCatalog ? (
            <TableEmpty
              title="No meters in registry"
              description="Add meters under Meters before connectivity can be shown."
            />
          ) : null}

          {!loading && !fetchFailed && noResults ? (
            <TableEmpty
              title="No rows match"
              description="Clear filters or widen search."
              action={
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
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
    </div>
  )
}
