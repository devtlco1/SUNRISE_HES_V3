"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CommandJobDetailContent } from "@/components/commands/command-job-detail-content"
import { CommandJobDetailsSheet } from "@/components/commands/command-job-details-sheet"
import { CommandRequestPanel } from "@/components/commands/command-request-panel"
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
import {
  COMMANDS_FETCH_NETWORK_ERROR,
  fetchCommandJobs,
} from "@/lib/commands/api"
import {
  type JobResultFilter,
  formatQueueState,
  jobMatchesResultFilter,
} from "@/lib/commands/format"
import {
  operationalMonoIdTriggerClass,
  operationalRowActionTriggerClass,
} from "@/lib/ui/operational"
import type { CommandJobRow } from "@/types/command"

const ALL = "all"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

function JobsTableHeaderRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="w-[148px]">Job</TableHead>
      <TableHead className="min-w-[160px]">Command</TableHead>
      <TableHead className="w-[120px]">Scope / Targets</TableHead>
      <TableHead className="min-w-[180px]">Submitted By</TableHead>
      <TableHead className="w-[128px]">Submitted At</TableHead>
      <TableHead className="w-[120px]">Queue State</TableHead>
      <TableHead className="min-w-[140px]">Result Summary</TableHead>
      <TableHead className="w-[72px] text-right">Actions</TableHead>
    </TableRow>
  )
}

type CommandsWorkspaceProps = {
  /**
   * When provided, skips `/api/commands` (e.g. `NEXT_PUBLIC_COMMANDS_USE_MOCK` or tests).
   * Pass `[]` to exercise an empty catalog without the API.
   */
  jobs?: CommandJobRow[]
}

function matchesJobSearch(row: CommandJobRow, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.id,
    row.templateName,
    row.commandType,
    row.submittedBy,
    row.resultSummary,
  ]
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function CommandsWorkspace({ jobs: jobsProp }: CommandsWorkspaceProps) {
  const staticMode = jobsProp !== undefined
  const [fetchedRows, setFetchedRows] = useState<CommandJobRow[]>([])
  const [loadKey, setLoadKey] = useState(0)
  const [loading, setLoading] = useState(jobsProp === undefined)
  const [error, setError] = useState<string | null>(null)

  const sourceRows = jobsProp !== undefined ? jobsProp : fetchedRows

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [queueFilter, setQueueFilter] = useState<string>(ALL)
  const [resultFilter, setResultFilter] = useState<JobResultFilter>("all")
  const [submitterFilter, setSubmitterFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetJob, setSheetJob] = useState<CommandJobRow | null>(null)
  const [queueNotice, setQueueNotice] = useState<string | null>(null)

  useEffect(() => {
    if (staticMode) return

    const ac = new AbortController()
    let stale = false

    fetchCommandJobs(ac.signal)
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
        setError(COMMANDS_FETCH_NETWORK_ERROR)
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
    const set = new Set(sourceRows.map((r) => r.commandType))
    return [
      { value: ALL, label: "All command types" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const submitterOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.submittedBy))
    return [
      { value: ALL, label: "All operators" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const filtered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (!matchesJobSearch(row, search)) return false
      if (typeFilter !== ALL && row.commandType !== typeFilter) return false
      if (queueFilter !== ALL && row.queueState !== queueFilter) return false
      if (!jobMatchesResultFilter(row, resultFilter)) return false
      if (submitterFilter !== ALL && row.submittedBy !== submitterFilter)
        return false
      return true
    })
  }, [
    sourceRows,
    search,
    typeFilter,
    queueFilter,
    resultFilter,
    submitterFilter,
  ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const selectedJob = useMemo(
    () => sourceRows.find((j) => j.id === selectedJobId) ?? null,
    [sourceRows, selectedJobId]
  )

  const filtersActive =
    search.trim() !== "" ||
    typeFilter !== ALL ||
    queueFilter !== ALL ||
    resultFilter !== "all" ||
    submitterFilter !== ALL

  function clearFilters() {
    setSearch("")
    setTypeFilter(ALL)
    setQueueFilter(ALL)
    setResultFilter("all")
    setSubmitterFilter(ALL)
    resetPage()
  }

  function selectJob(job: CommandJobRow) {
    setSelectedJobId(job.id)
  }

  function openJobSheet(job: CommandJobRow) {
    setSheetJob(job)
    setSelectedJobId(job.id)
    setSheetOpen(true)
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open)
    if (!open) setSheetJob(null)
  }

  const fetchFailed = !staticMode && !loading && error !== null
  const emptyCatalog = !fetchFailed && sourceRows.length === 0
  const noResults =
    !fetchFailed && !emptyCatalog && filtered.length === 0

  return (
    <>
    <div className="grid gap-6 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <CommandRequestPanel
          onQueued={(ref) => {
            setQueueNotice(
              `Request ${ref} logged in the UI only — no queue or execution.`
            )
            window.setTimeout(() => setQueueNotice(null), 8000)
          }}
        />
      </div>

      <div className="flex flex-col gap-6 xl:col-span-8">
        {queueNotice ? (
          <div
            className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            {queueNotice}
          </div>
        ) : null}

        <FilterBar>
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FilterSelect
                id="cmd-job-type"
                label="Command type"
                value={typeFilter}
                onChange={(v) => {
                  setTypeFilter(v)
                  resetPage()
                }}
                options={typeOptions}
              />
              <FilterSelect
                id="cmd-job-queue"
                label="Queue state"
                value={queueFilter}
                onChange={(v) => {
                  setQueueFilter(v)
                  resetPage()
                }}
                options={[
                  { value: ALL, label: "All queue states" },
                  { value: "submitted", label: "Submitted" },
                  { value: "queued", label: "Queued" },
                  { value: "dispatching", label: "Dispatching" },
                  { value: "running", label: "Running" },
                  { value: "completed", label: "Completed" },
                  { value: "partial_failure", label: "Partial failure" },
                  { value: "failed", label: "Failed" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
              <FilterSelect
                id="cmd-job-result"
                label="Result state"
                value={resultFilter}
                onChange={(v) => {
                  setResultFilter(v as JobResultFilter)
                  resetPage()
                }}
                options={[
                  { value: "all", label: "All outcomes" },
                  { value: "success_only", label: "All success" },
                  { value: "has_failures", label: "Has failures" },
                  { value: "in_progress", label: "In progress" },
                ]}
              />
              <FilterSelect
                id="cmd-job-submitter"
                label="Submitted by"
                value={submitterFilter}
                onChange={(v) => {
                  setSubmitterFilter(v)
                  resetPage()
                }}
                options={submitterOptions}
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
          title="Recent command jobs"
          description={
            staticMode
              ? "Static catalog — filters and pagination run client-side."
              : "Served from GET /api/commands. Read-only job history; request panel does not enqueue work."
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
                    placeholder="Search job ID, command, operator, summary…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      resetPage()
                    }}
                    aria-label="Search command jobs"
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
                  <Button type="button" variant="outline" size="sm" disabled>
                    Export jobs
                  </Button>
                  <Button type="button" variant="secondary" size="sm" disabled>
                    Columns
                  </Button>
                </>
              }
            />

            {loading ? (
              <div className="relative min-w-0">
                <div className="min-w-[960px]">
                  <Table>
                    <TableHeader>
                      <JobsTableHeaderRow />
                    </TableHeader>
                    <TableBodySkeleton rows={5} columns={8} />
                  </Table>
                </div>
              </div>
            ) : fetchFailed ? null : emptyCatalog || noResults ? null : (
              <div className="relative min-w-0">
                <div className="min-w-[960px]">
                  <Table>
                    <TableHeader>
                      <JobsTableHeaderRow />
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((row) => {
                        const q = formatQueueState(row.queueState)
                        const selected = row.id === selectedJobId
                        return (
                          <TableRow
                            key={row.id}
                            data-state={selected ? "selected" : undefined}
                            className={
                              selected ? "bg-muted/40 hover:bg-muted/50" : undefined
                            }
                          >
                            <TableCell className="align-top">
                              <button
                                type="button"
                                onClick={() => selectJob(row)}
                                className={operationalMonoIdTriggerClass}
                              >
                                {row.id}
                              </button>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="text-foreground">
                                {row.templateName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.commandType}
                              </div>
                            </TableCell>
                            <TableCell className="align-top tabular-nums text-muted-foreground">
                              {row.targetCount} meter(s)
                            </TableCell>
                            <TableCell className="align-top text-sm text-muted-foreground">
                              {row.submittedBy}
                            </TableCell>
                            <TableCell className="align-top tabular-nums text-muted-foreground">
                              {row.submittedAt}
                            </TableCell>
                            <TableCell className="align-top">
                              <StatusBadge variant={q.variant}>{q.label}</StatusBadge>
                            </TableCell>
                            <TableCell className="align-top text-sm text-foreground">
                              {row.resultSummary}
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
                                    onClick={() => openJobSheet(row)}
                                  >
                                    View job details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => selectJob(row)}
                                  >
                                    View meter results
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled>
                                    Duplicate request
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled>
                                    Cancel request
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled>
                                    Export result
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
                title="No command jobs"
                description={
                  staticMode
                    ? "Use an empty jobs prop to verify this layout."
                    : "The catalog source returned no rows. If this is unexpected, verify data/commands.json or the upstream feed."
                }
              />
            ) : null}

            {!loading && !fetchFailed && noResults ? (
              <TableEmpty
                title="No jobs match filters"
                description="Clear filters or widen command type, queue, and outcome criteria."
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

        <SectionCard
          title="Selected job — details & per-meter results"
          description="Queue summary and per-meter outcomes for the job selected in the table above."
        >
          <CommandJobDetailContent job={selectedJob} />
        </SectionCard>
      </div>
    </div>

    <CommandJobDetailsSheet
      job={sheetJob}
      open={sheetOpen}
      onOpenChange={onSheetOpenChange}
    />
    </>
  )
}
