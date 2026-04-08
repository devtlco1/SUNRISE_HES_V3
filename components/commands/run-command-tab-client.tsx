"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

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
import type {
  CommandGroup,
  CommandSchedule,
  ObisCodeGroup,
  UnifiedCommandRunRow,
} from "@/types/command-operator"

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

type ApiRuns = {
  rows: UnifiedCommandRunRow[]
  operatorRuns: unknown[]
  legacyAvailable: boolean
}

export function RunCommandTabClient() {
  const [groups, setGroups] = useState<CommandGroup[]>([])
  const [schedules, setSchedules] = useState<CommandSchedule[]>([])
  const [obisGroups, setObisGroups] = useState<ObisCodeGroup[]>([])
  const [runsData, setRunsData] = useState<ApiRuns | null>(null)
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
      if (!or.ok) throw new Error("Failed to load OBIS groups")
      const gRows: CommandGroup[] = await gr.json()
      const sRows: CommandSchedule[] = await sr.json()
      const oRows: ObisCodeGroup[] = await or.json()
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
      const res = await fetch("/api/command-runs", { cache: "no-store" })
      if (!res.ok) throw new Error(`Runs HTTP ${res.status}`)
      setRunsData(await res.json())
    } catch {
      /* keep prior */
    }
  }, [])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void loadRuns()
    const t = window.setInterval(() => void loadRuns(), 4000)
    return () => window.clearInterval(t)
  }, [loadRuns])

  const group = groups.find((g) => g.id === meterGroupId)
  const schedule = schedules.find((s) => s.id === scheduleId)
  const obisGroup = obisGroups.find((g) => g.id === obisCodeGroupId)

  const operatorRows = useMemo(
    () => runsData?.rows.filter((r) => r.source === "operator") ?? [],
    [runsData]
  )

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

      <SectionCard title="Compose read run">
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
                C · OBIS code group
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2"
                value={obisCodeGroupId}
                onChange={(e) => setObisCodeGroupId(e.target.value)}
              >
                {obisGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.objectCodes.length} codes)
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
              <span className="text-muted-foreground">Object codes:</span>{" "}
              {obisGroup ? obisGroup.objectCodes.length : 0}
            </p>
            <p>
              <span className="text-muted-foreground">Schedule:</span>{" "}
              {schedule ? scheduleSummary(schedule) : "—"}
            </p>
            <Button
              type="button"
              className="mt-2 w-full"
              disabled={
                submitting ||
                !meterGroupId ||
                !scheduleId ||
                !obisCodeGroupId ||
                !group?.memberMeterIds.length ||
                !obisGroup?.objectCodes.length
              }
              onClick={() => void startRun()}
            >
              D · Start run
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Runs & tasks">
        <div className="border-t border-border px-5 py-4">
          {operatorRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No operator runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Meter group</TableHead>
                  <TableHead>OBIS group</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.status}</TableCell>
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
                      {r.createdAt}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.startedAt ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.finishedAt ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[140px] truncate text-xs"
                      title={r.resultSummary}
                    >
                      {r.resultSummary}
                    </TableCell>
                    <TableCell
                      className="max-w-[120px] truncate text-xs text-destructive"
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
