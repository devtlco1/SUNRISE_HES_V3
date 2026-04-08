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
import type { ObisCatalogEntry } from "@/lib/obis/types"
import type {
  CommandActionGroup,
  CommandActionGroupMode,
} from "@/types/command-operator"

function modeLabel(m: CommandActionGroupMode): string {
  if (m === "read_catalog") return "Read (catalog)"
  if (m === "relay_on") return "Relay on"
  return "Relay off"
}

export function ObisCodeGroupsTabClient() {
  const [groups, setGroups] = useState<CommandActionGroup[]>([])
  const [catalog, setCatalog] = useState<ObisCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CommandActionGroup | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [actionMode, setActionMode] =
    useState<CommandActionGroupMode>("read_catalog")
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gr, cr] = await Promise.all([
        fetch("/api/command-obis-groups", { cache: "no-store" }),
        fetch("/api/obis-catalog", { cache: "no-store" }),
      ])
      if (!gr.ok) throw new Error("Failed to load action groups")
      if (!cr.ok) throw new Error("Failed to load catalog")
      setGroups(await gr.json())
      setCatalog(await cr.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const enabledCatalog = useMemo(
    () => catalog.filter((e) => e.enabled),
    [catalog]
  )

  const q = search.trim().toLowerCase()
  const filteredCatalog = useMemo(() => {
    if (!q) return enabledCatalog
    return enabledCatalog.filter(
      (e) =>
        e.object_code.toLowerCase().includes(q) ||
        e.object_name.toLowerCase().includes(q) ||
        e.obis.toLowerCase().includes(q) ||
        e.class_name.toLowerCase().includes(q) ||
        e.subclass_name.toLowerCase().includes(q)
    )
  }, [enabledCatalog, q])

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setActionMode("read_catalog")
    setSelectedCodes(new Set())
    setSheetOpen(true)
  }

  function openEdit(g: CommandActionGroup) {
    setEditing(g)
    setName(g.name)
    setDescription(g.description)
    setActionMode(g.actionMode)
    setSelectedCodes(new Set(g.objectCodes))
    setSheetOpen(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        actionMode,
        objectCodes:
          actionMode === "read_catalog" ? [...selectedCodes] : [],
      }
      const url = editing
        ? `/api/command-obis-groups/${editing.id}`
        : "/api/command-obis-groups"
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
    if (!window.confirm("Delete this action group?")) return
    setError(null)
    try {
      const res = await fetch(`/api/command-obis-groups/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Delete failed")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    }
  }

  function toggleCode(code: string) {
    setSelectedCodes((prev) => {
      const n = new Set(prev)
      if (n.has(code)) n.delete(code)
      else n.add(code)
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
        title="OBIS / Actions"
        description="Read presets from the PRM catalog, or relay on/off presets. Schedules and Run use these groups."
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
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No action groups.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {modeLabel(g.actionMode)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {g.actionMode === "read_catalog"
                        ? `${g.objectCodes.length} code(s)`
                        : "—"}
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
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border px-4 py-4">
            <SheetTitle>
              {editing ? "Edit action group" : "New action group"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Description</span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Action mode
              </span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={actionMode}
                onChange={(e) =>
                  setActionMode(e.target.value as CommandActionGroupMode)
                }
              >
                <option value="read_catalog">Read — OBIS catalog codes</option>
                <option value="relay_on">Relay on (reconnect)</option>
                <option value="relay_off">Relay off (disconnect)</option>
              </select>
            </label>

            {actionMode === "read_catalog" ? (
              <>
                <div className="text-xs text-muted-foreground">
                  Selected {selectedCodes.size} code(s)
                </div>
                <FilterBar>
                  <Input
                    className="h-8 max-w-xs text-sm"
                    placeholder="Filter catalog…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </FilterBar>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr>
                        <th className="w-8 px-2 py-1.5" />
                        <th className="px-2 py-1.5">Code</th>
                        <th className="px-2 py-1.5">Name</th>
                        <th className="px-2 py-1.5">Class / subclass</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCatalog.map((e) => (
                        <tr
                          key={e.object_code}
                          className="border-t border-border/80 hover:bg-muted/40"
                        >
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={selectedCodes.has(e.object_code)}
                              onChange={() => toggleCode(e.object_code)}
                              aria-label={`Select ${e.object_code}`}
                            />
                          </td>
                          <td className="px-2 py-1 font-mono">
                            {e.object_code}
                          </td>
                          <td className="max-w-[160px] truncate px-2 py-1">
                            {e.object_name}
                          </td>
                          <td className="max-w-[180px] truncate px-2 py-1 text-muted-foreground">
                            {e.class_name} · {e.subclass_name} · {e.sort_no}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No catalog selection. This group runs{" "}
                {actionMode === "relay_on" ? "relay reconnect" : "relay disconnect"}{" "}
                on each meter in the batch.
              </p>
            )}

            <Button
              type="button"
              className="w-full shrink-0"
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
