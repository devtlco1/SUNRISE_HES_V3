"use client"

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { FilterBar } from "@/components/shared/filter-bar"
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
import type { CommandGroup } from "@/types/command-operator"
import type { MeterListRow } from "@/types/meter"

export function CommandGroupsPageClient() {
  const [groups, setGroups] = useState<CommandGroup[]>([])
  const [meters, setMeters] = useState<MeterListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CommandGroup | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gr, mr] = await Promise.all([
        fetch("/api/command-groups", { cache: "no-store" }),
        fetch("/api/meters", { cache: "no-store" }),
      ])
      if (!gr.ok) throw new Error("Failed to load groups")
      if (!mr.ok) throw new Error("Failed to load meters")
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

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setSelectedIds(new Set())
    setSheetOpen(true)
  }

  function openEdit(g: CommandGroup) {
    setEditing(g)
    setName(g.name)
    setDescription(g.description)
    setSelectedIds(new Set(g.memberMeterIds))
    setSheetOpen(true)
  }

  const meterSearch = search.trim().toLowerCase()
  const filteredMeters = useMemo(() => {
    if (!meterSearch) return meters
    return meters.filter(
      (m) =>
        m.id.toLowerCase().includes(meterSearch) ||
        m.serialNumber.toLowerCase().includes(meterSearch)
    )
  }, [meters, meterSearch])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        memberMeterIds: [...selectedIds],
      }
      const url = editing
        ? `/api/command-groups/${editing.id}`
        : "/api/command-groups"
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
    if (!window.confirm("Delete this group?")) return
    setError(null)
    try {
      const res = await fetch(`/api/command-groups/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    }
  }

  function toggleMeter(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
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
        title="Saved meter groups"
        description="CRUD groups backed by data/command-groups.json. Members must exist in the meters registry."
        headerActions={
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon className="size-3.5" aria-hidden />
            New group
          </Button>
        }
      >
        <div className="border-t border-border px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups yet. Create one to target batches in Run now and Schedules.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {g.memberMeterIds.length}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Edit ${g.name}`}
                          onClick={() => openEdit(g)}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Delete ${g.name}`}
                          onClick={() => void remove(g.id)}
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
        <SheetContent side="right" className="w-full max-w-md sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit group" : "New group"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Description
              </span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Members ({selectedIds.size})
              </span>
              <FilterBar>
                <Input
                  placeholder="Search meters…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-xs"
                />
              </FilterBar>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
                {filteredMeters.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleMeter(m.id)}
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
