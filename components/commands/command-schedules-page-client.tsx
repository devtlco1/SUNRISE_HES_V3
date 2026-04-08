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
import type {
  CommandGroup,
  CommandSchedule,
  CommandScheduleCadenceType,
  CommandScheduleRecurrence,
  OperatorActionType,
  OperatorTargetType,
} from "@/types/command-operator"
import type { MeterListRow } from "@/types/meter"

function targetSummary(
  s: CommandSchedule,
  groupsById: Map<string, CommandGroup>
): string {
  if (s.targetType === "saved_group" && s.groupId) {
    const g = groupsById.get(s.groupId)
    return g ? `Group: ${g.name}` : `Group id ${s.groupId}`
  }
  if (s.targetType === "single_meter") {
    return s.meterIds[0] ? `Meter ${s.meterIds[0]}` : "—"
  }
  return `${s.meterIds.length} meter(s)`
}

function cadenceLabel(
  t: CommandScheduleCadenceType,
  r: CommandScheduleRecurrence
): string {
  if (t === "interval_minutes")
    return r.intervalMinutes != null ? `${r.intervalMinutes} min` : "—"
  if (t === "daily_time") return r.timeLocal ?? "—"
  if (t === "weekly") {
    const d = r.daysOfWeek?.length
      ? r.daysOfWeek.sort((a, b) => a - b).join(",")
      : "—"
    return `weekly ${d}`
  }
  return t
}

export function CommandSchedulesPageClient() {
  const [schedules, setSchedules] = useState<CommandSchedule[]>([])
  const [groups, setGroups] = useState<CommandGroup[]>([])
  const [meters, setMeters] = useState<MeterListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CommandSchedule | null>(null)
  const [name, setName] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [actionType, setActionType] = useState<OperatorActionType>("read")
  const [targetType, setTargetType] =
    useState<OperatorTargetType>("single_meter")
  const [groupId, setGroupId] = useState<string>("")
  const [singleMeterId, setSingleMeterId] = useState("")
  const [selectedMeterIds, setSelectedMeterIds] = useState<Set<string>>(
    new Set()
  )
  const [cadenceType, setCadenceType] =
    useState<CommandScheduleCadenceType>("interval_minutes")
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [timeLocal, setTimeLocal] = useState("02:00")
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(new Set([1]))
  const [notes, setNotes] = useState("")
  const [meterSearch, setMeterSearch] = useState("")
  const [saving, setSaving] = useState(false)

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sr, gr, mr] = await Promise.all([
        fetch("/api/command-schedules", { cache: "no-store" }),
        fetch("/api/command-groups", { cache: "no-store" }),
        fetch("/api/meters", { cache: "no-store" }),
      ])
      if (!sr.ok) throw new Error("Failed to load schedules")
      if (!gr.ok) throw new Error("Failed to load groups")
      if (!mr.ok) throw new Error("Failed to load meters")
      setSchedules(await sr.json())
      setGroups(await gr.json())
      setMeters(await mr.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function recurrencePayload(): CommandScheduleRecurrence {
    if (cadenceType === "interval_minutes")
      return { intervalMinutes: Math.max(1, intervalMinutes) }
    if (cadenceType === "daily_time") return { timeLocal: timeLocal.trim() }
    return { daysOfWeek: [...daysOfWeek].sort((a, b) => a - b) }
  }

  function openCreate() {
    setEditing(null)
    setName("")
    setEnabled(true)
    setActionType("read")
    setTargetType("single_meter")
    setGroupId(groups[0]?.id ?? "")
    setSingleMeterId(meters[0]?.id ?? "")
    setSelectedMeterIds(new Set())
    setCadenceType("interval_minutes")
    setIntervalMinutes(60)
    setTimeLocal("02:00")
    setDaysOfWeek(new Set([1]))
    setNotes("")
    setMeterSearch("")
    setSheetOpen(true)
  }

  function openEdit(s: CommandSchedule) {
    setEditing(s)
    setName(s.name)
    setEnabled(s.enabled)
    setActionType(s.actionType)
    setTargetType(s.targetType)
    setGroupId(s.groupId ?? "")
    if (s.targetType === "single_meter") {
      setSingleMeterId(s.meterIds[0] ?? "")
    } else {
      setSingleMeterId(meters[0]?.id ?? "")
    }
    setSelectedMeterIds(new Set(s.meterIds))
    setCadenceType(s.cadenceType)
    setIntervalMinutes(s.recurrence.intervalMinutes ?? 60)
    setTimeLocal(s.recurrence.timeLocal ?? "02:00")
    setDaysOfWeek(new Set(s.recurrence.daysOfWeek ?? [1]))
    setNotes(s.notes)
    setMeterSearch("")
    setSheetOpen(true)
  }

  function buildBody(): Record<string, unknown> {
    let meterIds: string[] = []
    if (targetType === "single_meter") {
      meterIds = singleMeterId.trim() ? [singleMeterId.trim()] : []
    } else if (targetType === "selected_meters") {
      meterIds = [...selectedMeterIds]
    } else {
      meterIds = []
    }
    return {
      name: name.trim(),
      enabled,
      actionType,
      targetType,
      meterIds,
      groupId: targetType === "saved_group" ? groupId || null : null,
      cadenceType,
      recurrence: recurrencePayload(),
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
    if (!window.confirm("Delete this schedule definition?")) return
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

  const ms = meterSearch.trim().toLowerCase()
  const filteredMeters = useMemo(() => {
    if (!ms) return meters
    return meters.filter(
      (m) =>
        m.id.toLowerCase().includes(ms) ||
        m.serialNumber.toLowerCase().includes(ms)
    )
  }, [meters, ms])

  function toggleDay(d: number) {
    setDaysOfWeek((prev) => {
      const n = new Set(prev)
      if (n.has(d)) n.delete(d)
      else n.add(d)
      return n
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Schedules are persisted definitions only in Phase 1 — there is no background
        runner claiming execution yet.
      </p>

      {error ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <SectionCard
        title="Saved schedules"
        description="Action, target, and cadence are stored in data/command-schedules.json."
        headerActions={
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon className="size-3.5" aria-hidden />
            New schedule
          </Button>
        }
      >
        <div className="border-t border-border px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No schedules yet. Create definitions for the execution engine to pick
              up later.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.enabled ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.actionType}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {targetSummary(s, groupsById)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cadenceLabel(s.cadenceType, s.recurrence)}
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
                          <Trash2Icon className="size-3.5 text-destructive" />
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
        <SheetContent
          side="right"
          className="flex w-full max-w-md flex-col gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>
              {editing ? "Edit schedule" : "New schedule"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <label className="space-y-1">
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
                className="size-3.5 accent-primary"
              />
              Enabled
            </label>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Action
              </span>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={actionType}
                onChange={(e) =>
                  setActionType(e.target.value as OperatorActionType)
                }
              >
                <option value="read">Read</option>
                <option value="relay_on">Relay on</option>
                <option value="relay_off">Relay off</option>
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Target
              </span>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={targetType}
                onChange={(e) =>
                  setTargetType(e.target.value as OperatorTargetType)
                }
              >
                <option value="single_meter">Single meter</option>
                <option value="selected_meters">Selected meters</option>
                <option value="saved_group">Saved group</option>
              </select>
            </div>

            {targetType === "saved_group" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Group
                </span>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberMeterIds.length})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {targetType === "single_meter" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Meter
                </span>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={singleMeterId}
                  onChange={(e) => setSingleMeterId(e.target.value)}
                >
                  {meters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.serialNumber} ({m.id})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {targetType === "selected_meters" ? (
              <div className="space-y-2">
                <Input
                  placeholder="Search meters…"
                  value={meterSearch}
                  onChange={(e) => setMeterSearch(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
                  {filteredMeters.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMeterIds.has(m.id)}
                        onChange={() =>
                          setSelectedMeterIds((prev) => {
                            const n = new Set(prev)
                            if (n.has(m.id)) n.delete(m.id)
                            else n.add(m.id)
                            return n
                          })
                        }
                        className="size-3.5 accent-primary"
                      />
                      <span className="truncate">
                        {m.serialNumber}{" "}
                        <span className="text-muted-foreground">({m.id})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Cadence
              </span>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={cadenceType}
                onChange={(e) =>
                  setCadenceType(e.target.value as CommandScheduleCadenceType)
                }
              >
                <option value="interval_minutes">Interval (minutes)</option>
                <option value="daily_time">Daily time</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {cadenceType === "interval_minutes" ? (
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Every N minutes
                </span>
                <Input
                  type="number"
                  min={1}
                  value={intervalMinutes}
                  onChange={(e) =>
                    setIntervalMinutes(Number(e.target.value) || 1)
                  }
                />
              </label>
            ) : null}
            {cadenceType === "daily_time" ? (
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Local time (HH:mm)
                </span>
                <Input
                  value={timeLocal}
                  onChange={(e) => setTimeLocal(e.target.value)}
                />
              </label>
            ) : null}
            {cadenceType === "weekly" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Weekdays (0=Sun … 6=Sat)
                </span>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <label
                      key={d}
                      className="flex cursor-pointer items-center gap-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={daysOfWeek.has(d)}
                        onChange={() => toggleDay(d)}
                        className="size-3 accent-primary"
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Notes
              </span>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={() => void save()}
                disabled={saving || !name.trim()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
