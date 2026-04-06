"use client"

import { MoreHorizontalIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

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
import { UserDetailsSheet } from "@/components/users/user-details-sheet"
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
import { mockUserListRows } from "@/lib/mock/users"
import {
  operationalListPageStackClass,
  operationalMonoIdTriggerClass,
  operationalRowActionTriggerClass,
} from "@/lib/ui/operational"
import { cn } from "@/lib/utils"
import { formatUserRole, formatUserStatus } from "@/lib/users/format"
import type { UserListRow } from "@/types/user"

const ALL = "all"
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const

function UsersTableHeaderRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className="min-w-[160px]">User</TableHead>
      <TableHead className="min-w-[200px]">Email / Username</TableHead>
      <TableHead className="w-[120px]">Role</TableHead>
      <TableHead className="min-w-[200px]">Team / Scope</TableHead>
      <TableHead className="w-[104px]">Status</TableHead>
      <TableHead className="w-[120px]">Last Active</TableHead>
      <TableHead className="w-[104px]">Created</TableHead>
      <TableHead className="w-[72px] text-right">Actions</TableHead>
    </TableRow>
  )
}

type UsersListProps = {
  rows?: UserListRow[]
}

function matchesSearch(row: UserListRow, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return [
    row.id,
    row.fullName,
    row.email,
    row.username,
    row.team,
    row.assignedScope,
    row.phone,
  ]
    .join(" ")
    .toLowerCase()
    .includes(n)
}

export function UsersList({ rows: sourceRows = mockUserListRows }: UsersListProps) {
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [teamFilter, setTeamFilter] = useState<string>(ALL)
  const [scopeFilter, setScopeFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<UserListRow | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 380)
    return () => window.clearTimeout(t)
  }, [])

  const resetPage = useCallback(() => setPage(1), [])

  const teamOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.team))
    return [
      { value: ALL, label: "All teams" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const scopeOptions = useMemo(() => {
    const set = new Set(sourceRows.map((r) => r.assignedScope))
    return [
      { value: ALL, label: "All scopes" },
      ...[...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    ]
  }, [sourceRows])

  const filtered = useMemo(() => {
    return sourceRows.filter((row) => {
      if (!matchesSearch(row, search)) return false
      if (roleFilter !== ALL && row.role !== roleFilter) return false
      if (statusFilter !== ALL && row.status !== statusFilter) return false
      if (teamFilter !== ALL && row.team !== teamFilter) return false
      if (scopeFilter !== ALL && row.assignedScope !== scopeFilter) return false
      return true
    })
  }, [sourceRows, search, roleFilter, statusFilter, teamFilter, scopeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const sliceStart = (currentPage - 1) * pageSize
  const pageRows = filtered.slice(sliceStart, sliceStart + pageSize)

  const filtersActive =
    search.trim() !== "" ||
    roleFilter !== ALL ||
    statusFilter !== ALL ||
    teamFilter !== ALL ||
    scopeFilter !== ALL

  function clearFilters() {
    setSearch("")
    setRoleFilter(ALL)
    setStatusFilter(ALL)
    setTeamFilter(ALL)
    setScopeFilter(ALL)
    resetPage()
  }

  function openDetails(row: UserListRow) {
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
      <OperationalActionStrip label="Directory">
        <Button type="button" size="sm" disabled>
          Add user
        </Button>
        <Button type="button" size="sm" variant="outline" disabled>
          Invite user
        </Button>
        <Button type="button" size="sm" variant="outline" disabled>
          Disable selected
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
          <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="usr-filter-role"
              label="Role"
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All roles" },
                { value: "operator", label: "Operator" },
                { value: "supervisor", label: "Supervisor" },
                { value: "admin", label: "Admin" },
                { value: "readonly", label: "Read-only" },
                { value: "integration", label: "Integration" },
              ]}
            />
            <FilterSelect
              id="usr-filter-status"
              label="Status"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v)
                resetPage()
              }}
              options={[
                { value: ALL, label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "suspended", label: "Suspended" },
                { value: "invited", label: "Invited" },
              ]}
            />
            <FilterSelect
              id="usr-filter-team"
              label="Team / department"
              value={teamFilter}
              onChange={(v) => {
                setTeamFilter(v)
                resetPage()
              }}
              options={teamOptions}
            />
            <FilterSelect
              id="usr-filter-scope"
              label="Assigned scope"
              value={scopeFilter}
              onChange={(v) => {
                setScopeFilter(v)
                resetPage()
              }}
              options={scopeOptions}
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
        title="Operator directory"
        description="Console accounts with role, scope, and status. Directory data is mock until identity is integrated."
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
                  placeholder="Search name, email, username, team, assigned scope…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    resetPage()
                  }}
                  aria-label="Search users"
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
              <div className="min-w-[1100px]">
                <Table>
                  <TableHeader>
                    <UsersTableHeaderRow />
                  </TableHeader>
                  <TableBodySkeleton rows={6} columns={8} />
                </Table>
              </div>
            </div>
          ) : emptyCatalog || noResults ? null : (
            <div className="relative min-w-0">
              <div className="min-w-[1100px]">
                <Table>
                  <TableHeader>
                    <UsersTableHeaderRow />
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const role = formatUserRole(row.role)
                      const st = formatUserStatus(row.status)
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="align-top">
                            <div className="text-sm font-medium text-foreground">
                              {row.fullName}
                            </div>
                            <button
                              type="button"
                              onClick={() => openDetails(row)}
                              className={cn(
                                operationalMonoIdTriggerClass,
                                "text-xs text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {row.id}
                            </button>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="max-w-[240px] truncate text-sm text-foreground">
                              {row.email}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              @{row.username}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={role.variant}>
                              {role.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="max-w-[220px] text-sm text-foreground">
                              {row.team}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.assignedScope}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-xs text-muted-foreground">
                            {row.lastActiveAt}
                          </TableCell>
                          <TableCell className="align-top tabular-nums text-xs text-muted-foreground">
                            {row.createdAt}
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={operationalRowActionTriggerClass}
                                aria-label={`Actions for ${row.username}`}
                              >
                                <MoreHorizontalIcon className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                  {row.fullName}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDetails(row)}
                                >
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>Edit user</DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  View activity
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Reset password
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Disable user
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled>
                                  Assign scope
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
              title="No users in directory"
              description="Provisioned accounts will appear here. Use an empty rows prop to verify this layout."
            />
          ) : null}

          {!loading && noResults ? (
            <TableEmpty
              title="No users match filters"
              description="Clear filters or widen role, team, and scope criteria."
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

      <UserDetailsSheet
        user={selected}
        open={sheetOpen}
        onOpenChange={onSheetOpenChange}
      />
    </div>
  )
}
