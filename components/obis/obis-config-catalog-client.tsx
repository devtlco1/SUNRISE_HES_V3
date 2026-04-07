"use client"

import { DownloadIcon, PencilIcon, PlusIcon, SaveIcon, TrashIcon, UploadIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { Button, buttonVariants } from "@/components/ui/button"
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
import type { CatalogImportSummary } from "@/lib/obis/catalog-import-upsert"
import type { ExcelCatalogMergeSummary } from "@/lib/obis/excel-catalog-merge"
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
  const [importing, setImporting] = useState(false)
  const [importInfo, setImportInfo] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const importExcelRef = useRef<HTMLInputElement>(null)
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

  function openImportPicker() {
    importFileRef.current?.click()
  }

  function openExcelImportPicker() {
    importExcelRef.current?.click()
  }

  async function onImportFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setImporting(true)
    setImportInfo(null)
    setSaveError(null)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        setImportInfo("Invalid JSON file.")
        return
      }
      const r = await fetch("/api/obis-catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      })
      const data = (await r.json()) as {
        ok?: boolean
        error?: string
        summary?: CatalogImportSummary
      }
      if (!r.ok || !data.ok) {
        const s = data.summary
        const extra =
          s && s.validationErrors?.length
            ? ` ${s.validationErrors
                .slice(0, 4)
                .map((x) => `[${x.index}] ${x.message}`)
                .join("; ")}`
            : ""
        setImportInfo((data.error ?? "Import failed") + extra)
        return
      }
      const s = data.summary
      if (s) {
        const errSample =
          s.validationErrors.length > 0
            ? ` Errors: ${s.validationErrors
                .slice(0, 3)
                .map((x) => `#${x.index} ${x.message}`)
                .join("; ")}`
            : ""
        setImportInfo(
          `Applied: inserted ${s.inserted}, updated ${s.updated}, disabled ${s.disabled}, rejected ${s.rejected}.${errSample}`
        )
      } else {
        setImportInfo("Import applied.")
      }
      await load()
    } catch {
      setImportInfo("Import failed")
    } finally {
      setImporting(false)
    }
  }

  async function onExcelImportSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setImporting(true)
    setImportInfo(null)
    setSaveError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      const r = await fetch("/api/obis-catalog/import-excel", {
        method: "POST",
        body,
      })
      const data = (await r.json()) as {
        ok?: boolean
        error?: string
        summary?: ExcelCatalogMergeSummary
        rowCount?: number
        message?: string
      }
      if (!r.ok || !data.ok) {
        setImportInfo(
          [data.error, data.message].filter(Boolean).join(": ") || "Excel import failed"
        )
        return
      }
      const s = data.summary
      if (s) {
        setImportInfo(
          `Excel merge: ${s.inserted} inserted, ${s.updated} updated, ${s.unchanged} unchanged, ` +
            `${s.skippedInvalidObis} invalid OBIS skipped, ${s.duplicateInSheetCollapsed} sheet duplicates collapsed ` +
            `(${s.duplicateDescriptionMismatches} desc conflicts). Rows: ${data.rowCount ?? "—"}.`
        )
      } else {
        setImportInfo("Excel import applied.")
      }
      await load()
    } catch {
      setImportInfo("Excel import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="OBIS catalog"
        subtitle="data/obis-catalog.json — JSON import upserts by OBIS; Excel merge refreshes meter-supported rows (OBIS, DESCRIPTION, ATTRIBUTES, R/W, UNIT) while preserving pack/sort and identity notes."
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void onImportFileSelected(e)}
            />
            <input
              ref={importExcelRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void onExcelImportSelected(e)}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              Reload
            </Button>
            <a
              href="/api/obis-catalog/template"
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <DownloadIcon className="mr-1 size-3.5" />
              Template
            </a>
            <a
              href="/api/obis-catalog/export"
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <DownloadIcon className="mr-1 size-3.5" />
              Export
            </a>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={importing || loading}
              onClick={openImportPicker}
            >
              <UploadIcon className="mr-1 size-3.5" />
              Import JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={importing || loading}
              onClick={openExcelImportPicker}
            >
              <UploadIcon className="mr-1 size-3.5" />
              Import Excel
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
      {importInfo ? (
        <p className={importInfo.includes("failed") ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {importInfo}
        </p>
      ) : null}

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
                  <TableCell className="max-w-[10rem] align-top font-mono text-xs whitespace-normal break-all">
                    {r.obis}
                  </TableCell>
                  <TableCell className="max-w-[min(16rem,32vw)] align-top text-xs whitespace-normal break-words">
                    {r.description}
                  </TableCell>
                  <TableCell className="align-top text-xs whitespace-normal break-words">
                    {r.object_type}
                  </TableCell>
                  <TableCell className="text-right align-top font-mono text-xs">{r.class_id}</TableCell>
                  <TableCell className="text-right align-top font-mono text-xs">{r.attribute}</TableCell>
                  <TableCell className="align-top text-xs whitespace-normal break-words">
                    {packLabel(r.pack_key)}
                  </TableCell>
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
