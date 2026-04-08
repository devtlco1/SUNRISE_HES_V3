"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react"

import { TableBodySkeleton } from "@/components/data-table/table-body-skeleton"
import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import {
  MeterDetailsSheet,
  type MeterSheetIntent,
} from "@/components/meters/meter-details-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { FilterSelect } from "@/components/shared/filter-select"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
  METERS_FETCH_NETWORK_ERROR,
  deleteMeter,
  fetchMeters,
} from "@/lib/meters/api"
import {
  formatAlarmState,
  formatCommStatus,
  formatPhaseType,
  formatRelayStatus,
} from "@/lib/meters/format"
import { cn } from "@/lib/utils"
import {
  operationalListPageStackClass,
  operationalMonoIdTriggerClass,
  operationalRowActionTriggerClass,
} from "@/lib/ui/operational"
import type { MeterListRow } from "@/types/meter"

const ALL = "all"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

const COL_STORAGE_KEY = "sunrise-meters-columns-v1"

export type MetersColumnKey =
  | "serial"
  | "internalId"
  | "location"
  | "mfr"
  | "comm"
  | "relay"
  | "lastReading"
  | "lastComm"
  | "alarm"
  | "actions"

const COL_LABELS: Record<MetersColumnKey, string> = {
  serial: "Serial",
  internalId: "Internal ID",
  location: "Location / Feeder",
  mfr: "Manufacturer / Model",
  comm: "Comm",
  relay: "Relay",
  lastReading: "Last reading",
  lastComm: "Last comm",
  alarm: "Alarm",
  actions: "Actions",
}

function defaultColumns(): Record<MetersColumnKey, boolean> {
  return {
    serial: true,
    internalId: true,
    location: true,
    mfr: true,
    comm: true,
    relay: true,
    lastReading: true,
    lastComm: true,
    alarm: true,
    actions: true,
  }
}

function loadColumnVisibility(): Record<MetersColumnKey, boolean> {
  if (typeof window === "undefined") return defaultColumns()
  try {
    const raw = localStorage.getItem(COL_STORAGE_KEY)
    if (!raw) return defaultColumns()
    const o = JSON.parse(raw) as Partial<Record<MetersColumnKey, boolean>>
    const base = defaultColumns()
    for (const k of Object.keys(base) as MetersColumnKey[]) {
      if (typeof o[k] === "boolean") base[k] = o[k]!
    }
    base.actions = true
    return base
  } catch {
    return defaultColumns()
  }
}

function disp(s: string): string {
  const t = s?.trim()
  return t ? t : "—"
}

type MetersListProps = {
  rows?: MeterListRow[]
  onRegisterActions?: (api: {
    openAdd: () => void
    refresh: () => void
  }) => void
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

export function MetersList({ rows: rowsProp, onRegisterActions }: MetersListProps) {
  const staticMode = rowsProp !== undefined
  const [fetchedRows, setFetchedRows] = useState<MeterListRow[]>([])
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(rowsProp === undefined)
  const [error, setError] = useState<string | null>(null)

  const [cols, setCols] = useState<Record<MetersColumnKey, boolean>>(defaultColumns)

  useEffect(() => {
    setCols(loadColumnVisibility())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(cols))
    } catch {
      /* ignore */
    }
  }, [cols])

  const sourceRows = rowsProp !== undefined ? rowsProp : fetchedRows

  const [search, setSearch] = useState("")
  const [commFilter, setCommFilter] = useState<string>(ALL)
  const [manufacturerFilter, setManufacturerFilter] = useState<string>(ALL)
  const [relayFilter, setRelayFilter] = useState<string>(ALL)
  const [alarmFilter, setAlarmFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetIntent, setSheetIntent] = useState<MeterSheetIntent>("detail")
  const [sheetFormInitially, setSheetFormInitially] = useState(false)
  const [selectedMeter, setSelectedMeter] = useState<MeterListRow | null>(null)

  const reload = useCallback(() => {
    if (staticMode) return
    setLoading(true)
    setError(null)
    setLoadKey((k) => k + 1)
  }, [staticMode])

  const openAdd = useCallback(() => {
    setSelectedMeter(null)
    setSheetIntent("add")
    setSheetFormInitially(false)
    setSheetOpen(true)
  }, [])

  useLayoutEffect(() => {
    onRegisterActions?.({ openAdd, refresh: reload })
  }, [onRegisterActions, openAdd, reload])

  useEffect(() => {
    if (staticMode) return

    const ac = new AbortController()
    let stale = false

    fetchMeters(ac.signal)
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
        setError(METERS_FETCH_NETWORK_ERROR)
        setFetchedRows([])
      })

    return () => {
      stale = true
      ac.abort()
    }
  }, [staticMode, loadKey])

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

  const visibleColCount =
    (cols.serial ? 1 : 0) +
    (cols.internalId ? 1 : 0) +
    (cols.location ? 1 : 0) +
    (cols.mfr ? 1 : 0) +
    (cols.comm ? 1 : 0) +
    (cols.relay ? 1 : 0) +
    (cols.lastReading ? 1 : 0) +
    (cols.lastComm ? 1 : 0) +
    (cols.alarm ? 1 : 0) +
    (cols.actions ? 1 : 0)

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
    setSheetIntent("detail")
    setSheetFormInitially(false)
    setSheetOpen(true)
  }

  function openEdit(meter: MeterListRow) {
    setSelectedMeter(meter)
    setSheetIntent("detail")
    setSheetFormInitially(true)
    setSheetOpen(true)
  }

  async function onDeleteRow(meter: MeterListRow) {
    if (staticMode) return
    if (
      !confirm(
        `Delete meter ${meter.serialNumber} (${meter.id}) from the registry?`
      )
    ) {
      return
    }
    const r = await deleteMeter({ id: meter.id })
    if (!r.ok) {
      window.alert(r.error)
      return
    }
    reload()
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) {
      setSelectedMeter(null)
      setSheetFormInitially(false)
    }
  }

  const fetchFailed = !staticMode && !loading && error !== null
  const emptyCatalog = !fetchFailed && sourceRows.length === 0
  const noResults = !fetchFailed && !emptyCatalog && filtered.length === 0

  return (
    <div className={operationalListPageStackClass}>
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

      <SectionCard title="Registry">
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
                  placeholder="Search meter ID, serial, customer, feeder, zone…"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={staticMode || loading}
                  onClick={reload}
                >
                  Refresh
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  >
                    Columns
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs">
                      Visible columns
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(Object.keys(COL_LABELS) as MetersColumnKey[]).map((k) => (
                      <DropdownMenuCheckboxItem
                        key={k}
                        className="text-xs"
                        checked={cols[k]}
                        disabled={k === "actions"}
                        onCheckedChange={(checked) => {
                          if (k === "actions") return
                          setCols((c) => ({ ...c, [k]: checked === true }))
                        }}
                      >
                        {COL_LABELS[k]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />

          {loading ? (
            <div className="relative min-w-0">
              <div className="min-w-[1040px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {cols.serial ? (
                        <TableHead className="w-[140px]">Serial</TableHead>
                      ) : null}
                      {cols.internalId ? (
                        <TableHead className="w-[160px] text-muted-foreground">
                          Internal ID
                        </TableHead>
                      ) : null}
                      {cols.location ? (
                        <TableHead className="min-w-[200px]">
                          Location / Feeder
                        </TableHead>
                      ) : null}
                      {cols.mfr ? (
                        <TableHead className="min-w-[160px]">
                          Manufacturer / Model
                        </TableHead>
                      ) : null}
                      {cols.comm ? (
                        <TableHead className="w-[110px]">Comm</TableHead>
                      ) : null}
                      {cols.relay ? (
                        <TableHead className="w-[110px]">Relay</TableHead>
                      ) : null}
                      {cols.lastReading ? (
                        <TableHead className="w-[128px]">Last reading</TableHead>
                      ) : null}
                      {cols.lastComm ? (
                        <TableHead className="w-[128px]">Last comm</TableHead>
                      ) : null}
                      {cols.alarm ? (
                        <TableHead className="w-[100px]">Alarm</TableHead>
                      ) : null}
                      {cols.actions ? (
                        <TableHead className="w-[72px] text-right">
                          Actions
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBodySkeleton
                    rows={6}
                    columns={Math.max(1, visibleColCount)}
                  />
                </Table>
              </div>
            </div>
          ) : fetchFailed ? null : emptyCatalog || noResults ? null : (
            <div className="relative min-w-0">
              <div className="min-w-[1040px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {cols.serial ? (
                        <TableHead className="w-[140px]">Serial</TableHead>
                      ) : null}
                      {cols.internalId ? (
                        <TableHead className="w-[160px] text-muted-foreground">
                          Internal ID
                        </TableHead>
                      ) : null}
                      {cols.location ? (
                        <TableHead className="min-w-[200px]">
                          Location / Feeder
                        </TableHead>
                      ) : null}
                      {cols.mfr ? (
                        <TableHead className="min-w-[160px]">
                          Manufacturer / Model
                        </TableHead>
                      ) : null}
                      {cols.comm ? (
                        <TableHead className="w-[110px]">Comm</TableHead>
                      ) : null}
                      {cols.relay ? (
                        <TableHead className="w-[110px]">Relay</TableHead>
                      ) : null}
                      {cols.lastReading ? (
                        <TableHead className="w-[128px]">Last reading</TableHead>
                      ) : null}
                      {cols.lastComm ? (
                        <TableHead className="w-[128px]">Last comm</TableHead>
                      ) : null}
                      {cols.alarm ? (
                        <TableHead className="w-[100px]">Alarm</TableHead>
                      ) : null}
                      {cols.actions ? (
                        <TableHead className="w-[72px] text-right">
                          Actions
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const comm = formatCommStatus(row.commStatus)
                      const relay = formatRelayStatus(row.relayStatus)
                      const alarm = formatAlarmState(row.alarmState)
                      return (
                        <TableRow key={row.id}>
                          {cols.serial ? (
                            <TableCell className="align-top">
                              <button
                                type="button"
                                onClick={() => openDetails(row)}
                                className={operationalMonoIdTriggerClass}
                              >
                                {disp(row.serialNumber)}
                              </button>
                            </TableCell>
                          ) : null}
                          {cols.internalId ? (
                            <TableCell className="align-top">
                              <span className="font-mono text-xs text-muted-foreground">
                                {disp(row.id)}
                              </span>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {formatPhaseType(row.phaseType)}
                              </div>
                            </TableCell>
                          ) : null}
                          {cols.location ? (
                            <TableCell className="align-top">
                              <div className="max-w-[220px] truncate text-foreground">
                                {disp(row.customerName)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {disp(row.feeder)} · {disp(row.zone)}
                              </div>
                            </TableCell>
                          ) : null}
                          {cols.mfr ? (
                            <TableCell className="align-top">
                              <div className="text-foreground">
                                {disp(row.manufacturer)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {disp(row.model)}
                              </div>
                            </TableCell>
                          ) : null}
                          {cols.comm ? (
                            <TableCell className="align-top">
                              <StatusBadge variant={comm.variant}>
                                {comm.label}
                              </StatusBadge>
                            </TableCell>
                          ) : null}
                          {cols.relay ? (
                            <TableCell className="align-top">
                              <StatusBadge variant={relay.variant}>
                                {relay.label}
                              </StatusBadge>
                            </TableCell>
                          ) : null}
                          {cols.lastReading ? (
                            <TableCell className="align-top tabular-nums text-muted-foreground">
                              {disp(row.lastReadingAt)}
                            </TableCell>
                          ) : null}
                          {cols.lastComm ? (
                            <TableCell className="align-top tabular-nums text-muted-foreground">
                              {disp(row.lastCommunicationAt)}
                            </TableCell>
                          ) : null}
                          {cols.alarm ? (
                            <TableCell className="align-top">
                              <StatusBadge variant={alarm.variant}>
                                {alarm.label}
                              </StatusBadge>
                            </TableCell>
                          ) : null}
                          {cols.actions ? (
                            <TableCell className="align-top text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className={operationalRowActionTriggerClass}
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
                                  <DropdownMenuItem
                                    disabled={staticMode}
                                    onClick={() => openEdit(row)}
                                  >
                                    Edit
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
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    disabled={staticMode}
                                    onClick={() => void onDeleteRow(row)}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          ) : null}
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
              title="Unable to load registry"
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
              title="No meters in registry"
              description={
                staticMode
                  ? "Use an empty rows prop to verify this layout."
                  : "The catalog source returned no rows. If this is unexpected, verify data/meters.json or the upstream feed."
              }
            />
          ) : null}

          {!loading && !fetchFailed && noResults ? (
            <TableEmpty
              title="No meters match filters"
              description="Clear search or widen comm, relay, and alarm filters."
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
        intent={sheetIntent}
        formInitially={sheetFormInitially}
        staticMode={staticMode}
        onAfterMutation={reload}
      />
    </div>
  )
}
