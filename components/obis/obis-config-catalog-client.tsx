"use client"

import { PencilIcon, PlusIcon, SaveIcon, TrashIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetFooter,
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
import { packLabel } from "@/lib/obis/types"
import type { ObisCatalogEntry } from "@/lib/obis/types"
import { cn } from "@/lib/utils"

const emptyRow = (): ObisCatalogEntry => ({
  obis: "",
  description: "",
  object_type: "Data",
  class_id: 1,
  attribute: 2,
  scaler_unit_attribute: 3,
  unit: "",
  result_format: "scalar",
  status: "catalog_only",
  pack_key: "basic_setting",
  enabled: true,
  sort_order: 0,
  notes: "",
})

export function ObisConfigCatalogClient() {
  const [rows, setRows] = useState<ObisCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [packFilter, setPackFilter] = useState<string | "all">("all")
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ObisCatalogEntry | null>(null)
  const [originalObis, setOriginalObis] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const r = await fetch("/api/obis-catalog", { cache: "no-store" })
      const data = await r.json()
      if (!r.ok || !Array.isArray(data)) {
        setError("Load failed")
        setRows([])
        return
      }
      setRows(data as ObisCatalogEntry[])
    } catch {
      setError("Load failed")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const packKeys = useMemo(() => {
    const u = new Set(rows.map((r) => r.pack_key))
    return [...u].sort()
  }, [rows])

  const filtered = useMemo(() => {
    if (packFilter === "all") return rows
    return rows.filter((r) => r.pack_key === packFilter)
  }, [rows, packFilter])

  function openAdd() {
    setOriginalObis(null)
    setEditing(emptyRow())
    setEditorOpen(true)
  }

  function openEdit(row: ObisCatalogEntry) {
    setOriginalObis(row.obis)
    setEditing({ ...row })
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditing(null)
    setOriginalObis(null)
  }

  function saveEditor() {
    if (!editing) return
    const o = editing.obis.trim()
    if (!o) {
      setSaveError("OBIS required")
      return
    }
    if (!originalObis && rows.some((r) => r.obis === o)) {
      setSaveError("Duplicate OBIS")
      return
    }
    if (
      originalObis &&
      originalObis !== o &&
      rows.some((r) => r.obis === o)
    ) {
      setSaveError("Duplicate OBIS")
      return
    }
    setSaveError(null)
    setRows((prev) => {
      const next = [...prev]
      const idx = originalObis
        ? next.findIndex((r) => r.obis === originalObis)
        : -1
      const row = { ...editing, obis: o }
      if (idx >= 0) next[idx] = row
      else next.push(row)
      return next
    })
    closeEditor()
  }

  function removeRow(obis: string) {
    if (!confirm(`Delete ${obis}?`)) return
    setRows((prev) => prev.filter((r) => r.obis !== obis))
  }

  async function saveCatalog() {
    setSaving(true)
    setSaveError(null)
    try {
      const r = await fetch("/api/obis-catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      })
      const data = await r.json()
      if (!r.ok) {
        setSaveError(typeof data?.error === "string" ? data.error : "Save failed")
        return
      }
      if (Array.isArray(data)) setRows(data as ObisCatalogEntry[])
    } catch {
      setSaveError("Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="OBIS catalog"
        subtitle="Persisted in data/obis-catalog.json. Save to apply."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              Reload
            </Button>
            <Button type="button" size="sm" onClick={openAdd}>
              <PlusIcon className="mr-1 size-3.5" />
              Add
            </Button>
            <Button type="button" size="sm" disabled={saving || loading} onClick={() => void saveCatalog()}>
              <SaveIcon className="mr-1 size-3.5" />
              Save
            </Button>
          </div>
        }
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPackFilter("all")}
          className={cn(
            "rounded border px-2 py-1 text-xs",
            packFilter === "all" ? "border-primary bg-primary/10" : "border-border"
          )}
        >
          All
        </button>
        {packKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPackFilter(k)}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              packFilter === k ? "border-primary bg-primary/10" : "border-border"
            )}
          >
            {packLabel(k)}
          </button>
        ))}
      </div>

      <div className="max-h-[min(75vh,800px)] overflow-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px]">Actions</TableHead>
              <TableHead>OBIS</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Cl</TableHead>
              <TableHead className="text-right">At</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead>En</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No rows
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.obis}>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => openEdit(r)}
                      aria-label="Edit"
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      onClick={() => removeRow(r.obis)}
                      aria-label="Delete"
                    >
                      <TrashIcon className="size-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.obis}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{r.description}</TableCell>
                  <TableCell className="text-xs">{r.object_type}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.class_id}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.attribute}</TableCell>
                  <TableCell className="text-xs">{packLabel(r.pack_key)}</TableCell>
                  <TableCell className="text-xs">{r.enabled ? "Y" : "N"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={editorOpen} onOpenChange={(o) => !o && closeEditor()}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col gap-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{originalObis ? "Edit OBIS" : "Add OBIS"}</SheetTitle>
          </SheetHeader>
          {editing ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1 text-sm">
              <div>
                <label htmlFor="obis" className="text-xs font-medium">
                  OBIS
                </label>
                <Input
                  id="obis"
                  className="mt-1 font-mono"
                  value={editing.obis}
                  onChange={(e) => setEditing({ ...editing, obis: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="desc" className="text-xs font-medium">
                  Description
                </label>
                <Input
                  id="desc"
                  className="mt-1"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="ot" className="text-xs font-medium">
                  Object type
                </label>
                <Input
                  id="ot"
                  className="mt-1"
                  value={editing.object_type}
                  onChange={(e) => setEditing({ ...editing, object_type: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="cid" className="text-xs font-medium">
                    Class ID
                  </label>
                  <Input
                    id="cid"
                    type="number"
                    className="mt-1"
                    value={editing.class_id}
                    onChange={(e) =>
                      setEditing({ ...editing, class_id: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="attr" className="text-xs font-medium">
                    Attribute
                  </label>
                  <Input
                    id="attr"
                    type="number"
                    className="mt-1"
                    value={editing.attribute}
                    onChange={(e) =>
                      setEditing({ ...editing, attribute: Number(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div>
                <label htmlFor="su" className="text-xs font-medium">
                  Scaler/unit attr
                </label>
                <Input
                  id="su"
                  type="number"
                  className="mt-1"
                  value={editing.scaler_unit_attribute}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      scaler_unit_attribute: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div>
                <label htmlFor="unit" className="text-xs font-medium">
                  Unit
                </label>
                <Input
                  id="unit"
                  className="mt-1"
                  value={editing.unit}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="rf" className="text-xs font-medium">
                  Result format
                </label>
                <Input
                  id="rf"
                  className="mt-1"
                  value={editing.result_format}
                  onChange={(e) => setEditing({ ...editing, result_format: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="pk" className="text-xs font-medium">
                  Pack key
                </label>
                <Input
                  id="pk"
                  className="mt-1 font-mono"
                  value={editing.pack_key}
                  onChange={(e) => setEditing({ ...editing, pack_key: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="st" className="text-xs font-medium">
                  Status
                </label>
                <select
                  id="st"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as ObisCatalogEntry["status"],
                    })
                  }
                >
                  <option value="active">active</option>
                  <option value="catalog_only">catalog_only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="so" className="text-xs font-medium">
                    Sort order
                  </label>
                  <Input
                    id="so"
                    type="number"
                    className="mt-1"
                    value={editing.sort_order}
                    onChange={(e) =>
                      setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={editing.enabled}
                      onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
              </div>
              <div>
                <label htmlFor="notes" className="text-xs font-medium">
                  Notes
                </label>
                <Input
                  id="notes"
                  className="mt-1"
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <SheetFooter className="gap-2 border-t pt-4">
            <Button type="button" onClick={saveEditor}>
              Apply
            </Button>
            <Button type="button" variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
