"use client"

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  CommandScheduleType,
} from "@/types/command-operator"

function typeLabel(s: CommandSchedule): string {
  if (s.scheduleType === "every_n_days") {
    return `Every ${s.intervalDays ?? "?"}d`
  }
  return s.scheduleType === "once" ? "Once" : "Daily"
}

function actionGroupTypeLabel(g: CommandActionGroup | undefined): string {
  if (!g) return "—"
  if (g.actionMode === "read_catalog") return "Read"
  if (g.actionMode === "relay_on") return "Relay on"
  return "Relay off"
}

function windowSummary(s: CommandSchedule): string {
  const parts: string[] = []
  if (s.startDate || s.endDate) {
    parts.push(`${s.startDate ?? "…"}→${s.endDate ?? "…"}`)
  }
  if (s.startTime || s.endTime) {
    parts.push(`${s.startTime ?? "…"}–${s.endTime ?? "…"}`)
  }
  return parts.length ? parts.join(" · ") : "—"
}

export function CommandSchedulesTabClient() {
  const [schedules, setSchedules] = useState<CommandSchedule[]>([])
  const [groups, setGroups] = useState<CommandGroup[]>([])
  const [obisGroups, setObisGroups] = useState<CommandActionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CommandSchedule | null>(null)
  const [name, setName] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [scheduleType, setScheduleType] =
    useState<CommandScheduleType>("daily")
  const [intervalDays, setIntervalDays] = useState(30)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [runAtTime, setRunAtTime] = useState("02:00")
  const [meterGroupId, setMeterGroupId] = useState("")
  const [obisCodeGroupId, setObisCodeGroupId] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  )
  const obisById = useMemo(
    () => new Map(obisGroups.map((g) => [g.id, g])),
    [obisGroups]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sr, gr, or] = await Promise.all([
        fetch("/api/command-schedules", { cache: "no-store" }),
        fetch("/api/command-groups", { cache: "no-store" }),
        fetch("/api/command-obis-groups", { cache: "no-store" }),
      ])
      if (!sr.ok) throw new Error("Failed to load schedules")
      if (!gr.ok) throw new Error("Failed to load groups")
      if (!or.ok) throw new Error("Failed to load action groups")
      setSchedules(await sr.json())
      setGroups(await gr.json())
      setObisGroups(await or.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setName("")
    setEnabled(true)
    setScheduleType("daily")
    setIntervalDays(30)
    setStartDate("")
    setEndDate("")
    setStartTime("")
    setEndTime("")
    setRunAtTime("02:00")
    setMeterGroupId(groups[0]?.id ?? "")
    setObisCodeGroupId(obisGroups[0]?.id ?? "")
    setNotes("")
    setSheetOpen(true)
  }

  function openEdit(s: CommandSchedule) {
    setEditing(s)
    setName(s.name)
    setEnabled(s.enabled)
    setScheduleType(s.scheduleType)
    setIntervalDays(s.intervalDays ?? 30)
    setStartDate(s.startDate ?? "")
    setEndDate(s.endDate ?? "")
    setStartTime(s.startTime ?? "")
    setEndTime(s.endTime ?? "")
    setRunAtTime(s.runAtTime ?? "02:00")
    setMeterGroupId(s.meterGroupId ?? "")
    setObisCodeGroupId(s.obisCodeGroupId ?? "")
    setNotes(s.notes)
    setSheetOpen(true)
  }

  function buildBody(): Record<string, unknown> {
    return {
      name: name.trim(),
      enabled,
      scheduleType,
      intervalDays: scheduleType === "every_n_days" ? intervalDays : null,
      startDate: startDate.trim() || null,
      endDate: endDate.trim() || null,
      startTime: startTime.trim() || null,
      endTime: endTime.trim() || null,
      runAtTime: runAtTime.trim() || null,
      meterGroupId: meterGroupId.trim() || null,
      obisCodeGroupId: obisCodeGroupId.trim() || null,
      notes: notes.trim(),
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body = buildBody()
      const url = editing
        ? `/api/command-schedules/${editing.id}`
        : "/api/command-schedules"
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(typeof j.error === "string" ? j.error : "Save failed")
      }
      setSheetOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this schedule?")) return
    setError(null)
    try {
      const res = await fetch(`/api/command-schedules/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Delete failed")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    }
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

      <SectionCard
        title="Schedules"
        description="Cadence, date range, time window, and defaults for automatic runs (meter + OBIS groups). Disabled rows never execute."
        headerActions={
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon className="size-3.5" aria-hidden />
            New
          </Button>
        }
      >
        <div className="border-t border-border px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedules.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Run at</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Meter grp</TableHead>
                  <TableHead>Action grp</TableHead>
                  <TableHead>Act. type</TableHead>
                  <TableHead>Next (Baghdad)</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs">
                      {s.enabled ? "yes" : "no"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {typeLabel(s)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {s.runAtTime ?? "02:00"}
                    </TableCell>
                    <TableCell
                      className="max-w-[140px] truncate text-xs text-muted-foreground"
                      title={windowSummary(s)}
                    >
                      {windowSummary(s)}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      {s.meterGroupId
                        ? (groupsById.get(s.meterGroupId)?.name ?? s.meterGroupId)
                        : "—"}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs">
                      {s.obisCodeGroupId
                        ? (obisById.get(s.obisCodeGroupId)?.name ??
                            s.obisCodeGroupId)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.obisCodeGroupId
                        ? actionGroupTypeLabel(
                            obisById.get(s.obisCodeGroupId)
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {isCommandScheduleFarNextRun(s.nextRunAt)
                        ? "—"
                        : formatCommandBaghdadDateTime(s.nextRunAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Edit ${s.name}`}
                          onClick={() => openEdit(s)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Delete ${s.name}`}
                          onClick={() => void remove(s.id)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>
              {editing ? "Edit schedule" : "New schedule"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled (required meter + OBIS groups when on)
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Cadence
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={scheduleType}
                onChange={(e) =>
                  setScheduleType(e.target.value as CommandScheduleType)
                }
              >
                <option value="once">One time</option>
                <option value="daily">Daily</option>
                <option value="every_n_days">Every N days</option>
              </select>
            </label>
            {scheduleType === "every_n_days" ? (
              <label className="space-y-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Interval (days)
                </span>
                <Input
                  type="number"
                  min={1}
                  value={intervalDays}
                  onChange={(e) =>
                    setIntervalDays(Number(e.target.value) || 1)
                  }
                />
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Run at (HH:mm, Baghdad)
              </span>
              <Input
                placeholder="02:00"
                value={runAtTime}
                onChange={(e) => setRunAtTime(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">From date</span>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">To date</span>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">From time</span>
                <Input
                  placeholder="HH:mm"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">To time</span>
                <Input
                  placeholder="HH:mm"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Meter group (auto-run target)
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={meterGroupId}
                onChange={(e) => setMeterGroupId(e.target.value)}
              >
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.memberMeterIds.length})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Action group — read or relay (auto-run)
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={obisCodeGroupId}
                onChange={(e) => setObisCodeGroupId(e.target.value)}
              >
                <option value="">—</option>
                {obisGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.objectCodes.length})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Notes</span>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <p className="text-[11px] text-muted-foreground">
              Overnight time windows are not supported; end must be after start on
              the same calendar day unless you leave the window open-ended.
            </p>
            <Button
              type="button"
              className="mt-2 w-full"
              disabled={saving}
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
