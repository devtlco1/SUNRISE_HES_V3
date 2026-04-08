"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { CommandRunStatusBadge } from "@/components/commands/command-run-status-badge"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCommandBaghdadDateTime } from "@/lib/format/command-baghdad-datetime"
import { isCommandScheduleFarNextRun } from "@/lib/commands/schedule-next-run"
import type {
  CommandActionGroup,
  CommandGroup,
  CommandSchedule,
  UnifiedCommandRunRow,
} from "@/types/command-operator"

const RUN_PAGE_SIZE = 25
const POLL_MS = 2000

function scheduleSummary(s: CommandSchedule): string {
  const t =
    s.scheduleType === "every_n_days"
      ? `every ${s.intervalDays}d`
      : s.scheduleType
  const rt = s.runAtTime ?? "02:00"
  const range =
    s.startDate || s.endDate
      ? ` dates ${s.startDate ?? "…"}–${s.endDate ?? "…"}`
      : ""
  const win =
    s.startTime || s.endTime
      ? ` window ${s.startTime ?? "…"}–${s.endTime ?? "…"}`
      : ""
  return `${t} @ ${rt}${range}${win}`
}

function actionGroupOptionLabel(g: CommandActionGroup): string {
  const mode =
    g.actionMode === "read_catalog"
      ? "read"
      : g.actionMode === "relay_on"
        ? "relay on"
        : "relay off"
  const detail =
    g.actionMode === "read_catalog"
      ? `${g.objectCodes.length} code(s)`
      : "no codes"
  return `${g.name} · ${mode} · ${detail}`
}

function reviewActionLine(g: CommandActionGroup | undefined): string {
  if (!g) return "—"
  if (g.actionMode === "read_catalog") {
    return `Read ${g.objectCodes.length} catalog code(s)`
  }
  if (g.actionMode === "relay_on") return "Relay on (reconnect)"
  return "Relay off (disconnect)"
}

type OperatorRunsApi = {
  scope: "operator"
  operatorRows: UnifiedCommandRunRow[]
  operatorTotal: number
  page: number
  pageSize: number
  legacyAvailable: boolean
}

export function RunCommandTabClient() {
  const [groups, setGroups] = useState<CommandGroup[]>([])
  const [schedules, setSchedules] = useState<CommandSchedule[]>([])
  const [obisGroups, setObisGroups] = useState<CommandActionGroup[]>([])
  const [operatorRows, setOperatorRows] = useState<UnifiedCommandRunRow[]>([])
  const [operatorTotal, setOperatorTotal] = useState(0)
  const [runPage, setRunPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [meterGroupId, setMeterGroupId] = useState("")
  const [scheduleId, setScheduleId] = useState("")
  const [obisCodeGroupId, setObisCodeGroupId] = useState("")

  const loadRefs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gr, sr, or] = await Promise.all([
        fetch("/api/command-groups", { cache: "no-store" }),
        fetch("/api/command-schedules", { cache: "no-store" }),
        fetch("/api/command-obis-groups", { cache: "no-store" }),
      ])
      if (!gr.ok) throw new Error("Failed to load meter groups")
      if (!sr.ok) throw new Error("Failed to load schedules")
      if (!or.ok) throw new Error("Failed to load action groups")
      const gRows: CommandGroup[] = await gr.json()
      const sRows: CommandSchedule[] = await sr.json()
      const oRows: CommandActionGroup[] = await or.json()
      setGroups(gRows)
      setSchedules(sRows)
      setObisGroups(oRows)
      setMeterGroupId((prev) => prev || gRows[0]?.id || "")
      setScheduleId((prev) => prev || sRows[0]?.id || "")
      setObisCodeGroupId((prev) => prev || oRows[0]?.id || "")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/command-runs?scope=operator&page=${runPage}&pageSize=${RUN_PAGE_SIZE}`,
        { cache: "no-store" }
      )
      if (!res.ok) throw new Error(`Runs HTTP ${res.status}`)
      const data = (await res.json()) as OperatorRunsApi
      if (data.scope !== "operator") return
      setOperatorRows(data.operatorRows)
      setOperatorTotal(data.operatorTotal)
    } catch {
      /* keep prior */
    }
  }, [runPage])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void loadRuns()
    const t = window.setInterval(() => void loadRuns(), POLL_MS)
    return () => window.clearInterval(t)
  }, [loadRuns])

  useEffect(() => {
    const max = Math.max(1, Math.ceil(operatorTotal / RUN_PAGE_SIZE))
    if (runPage > max) setRunPage(max)
  }, [operatorTotal, runPage])

  const group = groups.find((g) => g.id === meterGroupId)
  const schedule = schedules.find((s) => s.id === scheduleId)
  const obisGroup = obisGroups.find((g) => g.id === obisCodeGroupId)

  const canStart =
    Boolean(
      meterGroupId &&
        scheduleId &&
        obisCodeGroupId &&
        group &&
        group.memberMeterIds.length > 0 &&
        obisGroup &&
        (obisGroup.actionMode !== "read_catalog" ||
          obisGroup.objectCodes.length > 0)
    )

  const scheduleIdsWithActiveRun = useMemo(() => {
    const ids = new Set<string>()
    for (const r of operatorRows) {
      if (r.source !== "operator" || !r.scheduleId) continue
      if (r.status === "queued" || r.status === "running") {
        ids.add(r.scheduleId)
      }
    }
    return ids
  }, [operatorRows])

  const upcomingScheduleRows = useMemo(() => {
    return schedules
      .filter(
        (s) =>
          s.enabled &&
          s.nextRunAt &&
          !isCommandScheduleFarNextRun(s.nextRunAt) &&
          !scheduleIdsWithActiveRun.has(s.id)
      )
      .map((s) => {
        const nextTs = Date.parse(s.nextRunAt!)
        const mg = groups.find((g) => g.id === s.meterGroupId)
        const ag = obisGroups.find((g) => g.id === s.obisCodeGroupId)
        return {
          schedule: s,
          nextTs,
          meterGroupName: mg?.name ?? s.meterGroupId ?? "—",
          actionGroupName: ag?.name ?? s.obisCodeGroupId ?? "—",
          actionMode: ag?.actionMode ?? null,
        }
      })
      .filter((x) => Number.isFinite(x.nextTs))
      .sort((a, b) => a.nextTs - b.nextTs)
  }, [schedules, groups, obisGroups, scheduleIdsWithActiveRun])

  const maxPage = Math.max(1, Math.ceil(operatorTotal / RUN_PAGE_SIZE))
  const safePage = Math.min(runPage, maxPage)
  const fromIdx =
    operatorTotal === 0 ? 0 : (safePage - 1) * RUN_PAGE_SIZE + 1
  const toIdx = Math.min(safePage * RUN_PAGE_SIZE, operatorTotal)

  async function startRun() {
    setSubmitting(true)
    setError(null)
    setDoneMessage(null)
    try {
      const res = await fetch("/api/command-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meterGroupId,
          scheduleId,
          obisCodeGroupId,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Start run failed"
        )
      }
      setRunPage(1)
      setDoneMessage(`Queued ${j.id as string}`)
      void loadRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start run failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
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
      {doneMessage ? (
        <div
          className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
          role="status"
        >
          {doneMessage}
        </div>
      ) : null}

      <SectionCard title="Compose run">
        <div className="grid gap-4 border-t border-border px-5 py-4 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                A · Meter group
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2"
                value={meterGroupId}
                onChange={(e) => setMeterGroupId(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.memberMeterIds.length} meters)
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                B · Schedule
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2"
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                C · OBIS / Action group
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2"
                value={obisCodeGroupId}
                onChange={(e) => setObisCodeGroupId(e.target.value)}
              >
                {obisGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {actionGroupOptionLabel(g)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Review
            </div>
            <p>
              <span className="text-muted-foreground">Meters:</span>{" "}
              {group ? group.memberMeterIds.length : 0}
            </p>
            <p>
              <span className="text-muted-foreground">Action:</span>{" "}
              {reviewActionLine(obisGroup)}
            </p>
            <p>
              <span className="text-muted-foreground">Schedule:</span>{" "}
              {schedule ? scheduleSummary(schedule) : "—"}
            </p>
            <Button
              type="button"
              className="mt-2 w-full"
              disabled={submitting || !canStart}
              onClick={() => void startRun()}
            >
              D · Start run
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Upcoming scheduled fires"
        description="Enabled schedules with a real next fire time (Baghdad). Rows hide while a queued or running auto-run exists for that schedule; completed runs appear in the table below."
      >
        <div className="border-t border-border px-5 py-4">
          {upcomingScheduleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enabled schedules with a computed next run time.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Meter group</TableHead>
                  <TableHead>Action group</TableHead>
                  <TableHead>Next fire (Baghdad)</TableHead>
                  <TableHead>Queue state</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingScheduleRows.map((row) => {
                  const isFuture = row.nextTs > Date.now()
                  return (
                    <TableRow key={row.schedule.id}>
                      <TableCell className="font-medium text-xs">
                        {row.schedule.name}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs">
                        {row.meterGroupName}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs">
                        {row.actionGroupName}
                        {row.actionMode ? (
                          <span className="block text-[10px] text-muted-foreground">
                            {row.actionMode}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatCommandBaghdadDateTime(row.schedule.nextRunAt)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {isFuture ? (
                          <span className="text-amber-700 dark:text-amber-400">
                            upcoming
                          </span>
                        ) : (
                          <span className="text-sky-700 dark:text-sky-400">
                            due (scheduler)
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Runs & tasks">
        <p className="border-b border-border px-5 py-2 text-[11px] text-muted-foreground">
          History is paginated (newest first). Refresh ~every {POLL_MS / 1000}s.
          Pending → running can be brief; if you see pending then failed with a
          hint, the worker executed and the runtime returned an error (e.g.
          sidecar URL unset, HTTP error, or meter unreachable).
        </p>
        <div className="px-5 py-4">
          {operatorRows.length === 0 && operatorTotal === 0 ? (
            <p className="text-sm text-muted-foreground">No operator runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Meter group</TableHead>
                  <TableHead>Action group</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Failure hint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">
                      <CommandRunStatusBadge
                        status={r.operatorDisplayStatus ?? r.status}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.operatorTrigger ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {r.meterGroupName ?? r.meterGroupId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {r.obisCodeGroupName ?? r.obisCodeGroupId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">
                      {r.scheduleName ?? r.scheduleId ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatCommandBaghdadDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatCommandBaghdadDateTime(r.startedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatCommandBaghdadDateTime(r.finishedAt)}
                    </TableCell>
                    <TableCell
                      className="max-w-[130px] truncate text-xs"
                      title={r.resultSummary}
                    >
                      {r.resultSummary}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-xs text-destructive"
                      title={
                        r.failureHint ?? r.errorSummary ?? ""
                      }
                    >
                      {r.failureHint ?? r.errorSummary ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {operatorTotal > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
              <span className="text-muted-foreground">
                {fromIdx}–{toIdx} of {operatorTotal}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={safePage <= 1}
                  onClick={() => setRunPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={safePage >= maxPage}
                  onClick={() =>
                    setRunPage((p) => Math.min(maxPage, p + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  )
}
