"use client"

import { useEffect, useMemo, useState } from "react"

import { FilterBar } from "@/components/shared/filter-bar"
import { SectionCard } from "@/components/shared/section-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { UnifiedCommandRunRow } from "@/types/command-operator"

type ApiResponse = {
  rows: UnifiedCommandRunRow[]
  legacyAvailable: boolean
}

export function CommandsUnifiedRunsClient() {
  const [rows, setRows] = useState<UnifiedCommandRunRow[]>([])
  const [legacyAvailable, setLegacyAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<"all" | "operator" | "legacy">(
    "all"
  )

  useEffect(() => {
    let stale = false
    const ac = new AbortController()
    const load = () =>
      fetch("/api/command-runs", { signal: ac.signal, cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<ApiResponse>
        })
        .then((data) => {
          if (stale) return
          setRows(data.rows)
          setLegacyAvailable(data.legacyAvailable)
          setError(null)
        })
        .catch((e) => {
          if (e instanceof Error && e.name === "AbortError") return
          if (stale) return
          setError(e instanceof Error ? e.message : "Load failed")
          setRows([])
        })
        .finally(() => {
          if (!stale) setLoading(false)
        })

    void load()
    const t = window.setInterval(() => void load(), 4000)
    return () => {
      stale = true
      ac.abort()
      window.clearInterval(t)
    }
  }, [])

  const filtered = useMemo(() => {
    if (sourceFilter === "all") return rows
    return rows.filter((r) =>
      sourceFilter === "operator"
        ? r.source === "operator"
        : r.source === "legacy_catalog"
    )
  }, [rows, sourceFilter])

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Table refreshes every 4s. Operator runs persist in data/command-runs.json and
        execute on the server. Legacy rows are a static catalog from data/commands.json.
      </p>
      {!legacyAvailable ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Legacy catalog file did not load; only operator-recorded runs appear.
        </p>
      ) : null}

      {error ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <SectionCard title="Execution records">
        <FilterBar>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Source</span>
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as typeof sourceFilter)
              }
            >
              <option value="all">All</option>
              <option value="operator">Operator runs</option>
              <option value="legacy">Legacy catalog</option>
            </select>
          </label>
        </FilterBar>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No execution records match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Id</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Schedule id</TableHead>
                  <TableHead>Meter grp</TableHead>
                  <TableHead>OBIS grp</TableHead>
                  <TableHead>Sched. name</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meters</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={`${r.source}:${r.id}`}>
                    <TableCell className="max-w-[120px] truncate font-mono text-xs">
                      {r.id}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.source === "operator" ? "operator" : "catalog"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.operatorTrigger ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[100px] truncate font-mono text-xs text-muted-foreground"
                      title={r.scheduleId ?? ""}
                    >
                      {r.scheduleId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      {r.meterGroupName ?? r.meterGroupId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      {r.obisCodeGroupName ?? r.obisCodeGroupId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      {r.scheduleName ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.actionType}</TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-xs"
                      title={r.targetSummary}
                    >
                      {r.targetSummary}
                    </TableCell>
                    <TableCell className="text-xs">{r.status}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.meterOutcomeBrief ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.createdAt}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.startedAt ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.finishedAt ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[160px] truncate text-xs"
                      title={r.resultSummary}
                    >
                      {r.resultSummary}
                    </TableCell>
                    <TableCell
                      className="max-w-[140px] truncate text-xs text-destructive"
                      title={r.errorSummary ?? ""}
                    >
                      {r.errorSummary ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
