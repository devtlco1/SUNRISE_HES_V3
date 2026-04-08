"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  OperatorActionType,
  OperatorTargetType,
} from "@/types/command-operator"
import type { MeterListRow } from "@/types/meter"

const READ_MODES: { id: string; label: string }[] = [
  {
    id: "default_register_pull",
    label: "Default register pull (Phase 1 placeholder)",
  },
  {
    id: "obis_catalog_slice_v1",
    label: "OBIS catalog slice — future binding",
  },
]

export function CommandsRunNowClient() {
  const [meters, setMeters] = useState<MeterListRow[]>([])
  const [groups, setGroups] = useState<
    { id: string; name: string; memberMeterIds: string[] }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [targetType, setTargetType] =
    useState<OperatorTargetType>("single_meter")
  const [actionType, setActionType] = useState<OperatorActionType>("read")
  const [readProfileMode, setReadProfileMode] = useState(READ_MODES[0]!.id)
  const [singleMeterId, setSingleMeterId] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupId, setGroupId] = useState("")
  const [meterSearch, setMeterSearch] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mr, gr] = await Promise.all([
        fetch("/api/meters", { cache: "no-store" }),
        fetch("/api/command-groups", { cache: "no-store" }),
      ])
      if (!mr.ok) throw new Error("Failed to load meters")
      if (!gr.ok) throw new Error("Failed to load groups")
      const mRows: MeterListRow[] = await mr.json()
      const gRows = await gr.json()
      setMeters(mRows)
      setGroups(gRows)
      setSingleMeterId((prev) => prev || mRows[0]?.id || "")
      setGroupId((prev) => prev || gRows[0]?.id || "")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const ms = meterSearch.trim().toLowerCase()
  const filteredMeters = useMemo(() => {
    if (!ms) return meters
    return meters.filter(
      (m) =>
        m.id.toLowerCase().includes(ms) ||
        m.serialNumber.toLowerCase().includes(ms)
    )
  }, [meters, ms])

  const meterIdsPayload = useMemo(() => {
    if (targetType === "single_meter") {
      return singleMeterId.trim() ? [singleMeterId.trim()] : []
    }
    if (targetType === "selected_meters") return [...selectedIds]
    return []
  }, [targetType, singleMeterId, selectedIds])

  const reviewTarget =
    targetType === "saved_group"
      ? `Saved group: ${groups.find((g) => g.id === groupId)?.name ?? groupId}`
      : targetType === "single_meter"
        ? meters.find((m) => m.id === singleMeterId)
          ? `${meters.find((m) => m.id === singleMeterId)!.serialNumber} (${singleMeterId})`
          : singleMeterId || "—"
        : `${selectedIds.size} selected meter(s)`

  async function submit() {
    setSubmitting(true)
    setError(null)
    setDoneMessage(null)
    try {
      const body: Record<string, unknown> = {
        actionType,
        targetType,
        meterIds: meterIdsPayload,
        groupId: targetType === "saved_group" ? groupId || null : null,
      }
      if (actionType === "read") {
        body.readProfileMode = readProfileMode
      }
      const res = await fetch("/api/command-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof j.detail === "string"
            ? j.detail
            : typeof j.error === "string"
              ? j.error
              : "Submit failed"
        )
      }
      setDoneMessage(
        `Recorded run ${j.id as string}. Phase 1 does not dispatch to the runtime — see Runs for the queue row.`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading registry…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Compose a command for audit and future execution. Submitting records a queued
        operator run in data/command-runs.json — no automatic sidecar dispatch in Phase
        1.
      </p>

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
          className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {doneMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Target" description="Who receives the command.">
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Target type
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
                <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
                  {filteredMeters.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() =>
                          setSelectedIds((prev) => {
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
                  {groups.length === 0 ? (
                    <option value="">No groups — create under Groups</option>
                  ) : null}
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberMeterIds.length} members)
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Action" description="What to request from the device layer.">
          <div className="space-y-3">
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
                <option value="read">Read job</option>
                <option value="relay_on">Relay on</option>
                <option value="relay_off">Relay off</option>
              </select>
            </div>

            {actionType === "read" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Read profile / source
                </span>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={readProfileMode}
                  onChange={(e) => setReadProfileMode(e.target.value)}
                >
                  {READ_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Review"
        description="Confirm scope before recording the operator run."
      >
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Action</dt>
            <dd className="font-medium">{actionType}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Target</dt>
            <dd className="max-w-[min(100%,280px)] text-right font-medium">
              {reviewTarget}
            </dd>
          </div>
          {actionType === "read" ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Read mode</dt>
              <dd className="text-right font-medium">{readProfileMode}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={
              submitting ||
              (targetType === "selected_meters" && selectedIds.size === 0) ||
              (targetType === "saved_group" &&
                (!groupId || groups.length === 0)) ||
              (targetType === "single_meter" && !singleMeterId.trim())
            }
          >
            {submitting ? "Recording…" : "Record run request"}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}
