"use client"

import { ChevronDownIcon, DownloadIcon, PencilIcon, PlusIcon, SaveIcon, TrashIcon, UploadIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { fetchObisCatalog } from "@/lib/obis/catalog-client"
import {
  catalogRowKindShortLabel,
  catalogRowKindTitle,
  inferCatalogRowKind,
} from "@/lib/obis/catalog-row-kind"
import {
  classNamesPresent,
  subclassKey,
  subclassKeysForClass,
  subclassLabelFromKey,
} from "@/lib/obis/catalog-vendor-group"
import type { ExcelCatalogMergeSummary } from "@/lib/obis/excel-catalog-merge"
import type { ObisCatalogEntry } from "@/lib/obis/types"
import { cn } from "@/lib/utils"

function notifyObisCatalogSaved() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("sunrise-obis-catalog-saved"))
}

const emptyRow = (): ObisCatalogEntry => ({
  object_code: "",
  obis: "",
  description: "",
  object_name: "",
  class_name: "Unmapped",
  subclass_name: "",
  sort_no: 0,
  protocol: "2",
  obis_hex: "",
  data_type: "",
  analytic_type: "",
  unit: "",
  scaler: 0,
  read_batch_status: "",
  read_single_status: "",
  collect_plan_status: "",
  collect_plan_type_status: "",
  setting_status: "",
  display_status: "",
  xslt: "",
  phase: "",
  device_type: "",
  object_status: "",
  cim_code: "",
  crt_on: "",
  mdf_on: "",
  object_type: "Data",
  class_id: 1,
  attribute: 2,
  scaler_unit_attribute: 3,
  result_format: "scalar",
  status: "catalog_only",
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
  const importSpreadsheetRef = useRef<HTMLInputElement>(null)
  const [classFilter, setClassFilter] = useState<string | "all">("all")
  const [subclassFilter, setSubclassFilter] = useState<string | "all">("all")
  /** Default: working catalog — only enabled rows. Enable to audit disabled rows. */
  const [showDisabledRows, setShowDisabledRows] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ObisCatalogEntry | null>(null)
  const [originalObjectCode, setOriginalObjectCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const r = await fetchObisCatalog()
      if (!r.ok) {
        setError(r.error)
        setRows([])
        return
      }
      setRows(r.rows)
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

  const classNames = useMemo(() => classNamesPresent(rows), [rows])

  const subclassKeysList = useMemo(() => {
    if (classFilter === "all") return []
    return subclassKeysForClass(rows, classFilter)
  }, [rows, classFilter])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!showDisabledRows && !r.enabled) return false
      if (classFilter !== "all" && r.class_name !== classFilter) return false
      if (classFilter !== "all" && subclassFilter !== "all" && subclassKey(r) !== subclassFilter)
        return false
      return true
    })
  }, [rows, classFilter, subclassFilter, showDisabledRows])

  function openAdd() {
    setOriginalObjectCode(null)
    setEditing(emptyRow())
    setEditorOpen(true)
  }

  function openEdit(row: ObisCatalogEntry) {
    setOriginalObjectCode(row.object_code)
    setEditing({ ...row })
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditing(null)
    setOriginalObjectCode(null)
  }

  function saveEditor() {
    if (!editing) return
    const oc = editing.object_code.trim()
    if (!oc) {
      setSaveError("Object code required")
      return
    }
    if (!originalObjectCode && rows.some((r) => r.object_code === oc)) {
      setSaveError("Duplicate object code")
      return
    }
    if (originalObjectCode && originalObjectCode !== oc && rows.some((r) => r.object_code === oc)) {
      setSaveError("Duplicate object code")
      return
    }
    setSaveError(null)
    setRows((prev) => {
      const next = [...prev]
      const idx = originalObjectCode
        ? next.findIndex((r) => r.object_code === originalObjectCode)
        : -1
      const row = {
        ...editing,
        object_code: oc,
        sort_order: editing.sort_no,
      }
      if (idx >= 0) next[idx] = row
      else next.push(row)
      return next
    })
    closeEditor()
  }

  function removeRow(objectCode: string) {
    if (!confirm(`Delete ${objectCode}?`)) return
    setRows((prev) => prev.filter((r) => r.object_code !== objectCode))
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
      if (Array.isArray(data)) {
        setRows(data as ObisCatalogEntry[])
        notifyObisCatalogSaved()
      }
    } catch {
      setSaveError("Save failed")
    } finally {
      setSaving(false)
    }
  }

  function openSpreadsheetPicker() {
    importSpreadsheetRef.current?.click()
  }

  async function onSpreadsheetSelected(e: React.ChangeEvent<HTMLInputElement>) {
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
        const warn =
          data.summary?.parseWarnings?.length && data.summary.parseWarnings.length > 0
            ? ` ${data.summary.parseWarnings.join("; ")}`
            : ""
        setImportInfo(
          ([data.error, data.message].filter(Boolean).join(": ") || "Import failed") + warn
        )
        return
      }
      const s = data.summary
      if (s) {
        const pw =
          s.parseWarnings?.length && s.parseWarnings.length > 0
            ? ` Warnings: ${s.parseWarnings.slice(0, 5).join("; ")}`
            : ""
        setImportInfo(
          `Imported: ${s.inserted} new, ${s.updated} updated, ${s.unchanged} unchanged. ` +
            `Rows in file: ${data.rowCount ?? "—"}.${pw}`
        )
      } else {
        setImportInfo("Import applied.")
      }
      await load()
      notifyObisCatalogSaved()
    } catch {
      setImportInfo("Import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="OBIS catalog"
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              ref={importSpreadsheetRef}
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => void onSpreadsheetSelected(e)}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              Reload
            </Button>
            <a
              href="/api/obis-catalog/export"
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <DownloadIcon className="mr-1 size-3.5" />
              Export
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "gap-1"
                )}
                disabled={importing || loading}
              >
                <UploadIcon className="size-3.5" />
                Import
                <ChevronDownIcon className="size-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={openSpreadsheetPicker}>Upload file</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/obis-catalog/template")
                      const blob = await r.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = "obis-catalog-template.csv"
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Download template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      <p className="text-[11px] leading-snug text-muted-foreground">
        Chips list exact <span className="font-medium text-foreground">PRM ClassName</span> /{" "}
        <span className="font-medium text-foreground">SubClassName</span> values from the vendor DB (names like
        Basic or Energy are PRM classes, not the old three-tab UI). Order uses{" "}
        <span className="font-medium text-foreground">SortNo</span>. There are no Family/Section/Pack columns.
      </p>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="size-3.5 rounded border-input"
          checked={showDisabledRows}
          onChange={(e) => setShowDisabledRows(e.target.checked)}
        />
        Show disabled rows (full vendor / audit)
      </label>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setClassFilter("all")
            setSubclassFilter("all")
          }}
          className={cn(
            "rounded border px-2 py-1 text-xs",
            classFilter === "all" ? "border-primary bg-primary/10" : "border-border"
          )}
        >
          All classes
        </button>
        {classNames.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setClassFilter(c)
              setSubclassFilter("all")
            }}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              classFilter === c ? "border-primary bg-primary/10" : "border-border"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {classFilter !== "all" ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSubclassFilter("all")}
            className={cn(
              "rounded border px-2 py-1 text-xs",
              subclassFilter === "all" ? "border-primary bg-primary/10" : "border-border"
            )}
          >
            All subclasses
          </button>
          {subclassKeysList.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSubclassFilter(k)}
              className={cn(
                "rounded border px-2 py-1 text-xs",
                subclassFilter === k ? "border-primary bg-primary/10" : "border-border"
              )}
            >
              {subclassLabelFromKey(k)}
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground tabular-nums">
        Displayed rows: {loading ? "—" : filtered.length}
      </p>

      <div className="max-h-[min(75vh,800px)] overflow-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap">Object code</TableHead>
              <TableHead className="whitespace-nowrap">OBIS</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Subclass</TableHead>
              <TableHead className="text-right">Sort</TableHead>
              <TableHead className="w-8 text-center text-[10px] font-normal" title="Read shape hint">
                Kind
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Cl</TableHead>
              <TableHead className="text-right">At</TableHead>
              <TableHead>En</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground">
                  No rows
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const kind = inferCatalogRowKind(r)
                return (
                <TableRow key={r.object_code}>
                  <TableCell className="max-w-[11rem] align-top font-mono text-[10px] whitespace-normal break-all">
                    {r.object_code}
                  </TableCell>
                  <TableCell className="max-w-[9rem] align-top font-mono text-xs whitespace-normal break-all">
                    {r.obis}
                  </TableCell>
                  <TableCell className="max-w-[min(14rem,28vw)] align-top text-xs whitespace-normal break-words">
                    {r.description}
                  </TableCell>
                  <TableCell className="align-top text-xs whitespace-normal break-words">{r.class_name}</TableCell>
                  <TableCell className="max-w-[min(10rem,24vw)] align-top text-xs whitespace-normal break-words">
                    {(r.subclass_name ?? "").trim() || "—"}
                  </TableCell>
                  <TableCell className="text-right align-top font-mono text-xs">{r.sort_no}</TableCell>
                  <TableCell className="p-1 text-center align-top font-mono text-[10px] text-muted-foreground">
                    <span title={catalogRowKindTitle(kind)}>
                      {catalogRowKindShortLabel(kind)}
                    </span>
                  </TableCell>
                  <TableCell className="align-top text-xs whitespace-normal break-words">{r.object_type}</TableCell>
                  <TableCell className="text-right align-top font-mono text-xs">{r.class_id}</TableCell>
                  <TableCell className="text-right align-top font-mono text-xs">{r.attribute}</TableCell>
                  <TableCell className="text-xs">{r.enabled ? "Y" : "N"}</TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap text-right">
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
                      onClick={() => removeRow(r.object_code)}
                      aria-label="Delete"
                    >
                      <TrashIcon className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )})
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={editorOpen} onOpenChange={(o) => !o && closeEditor()}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col gap-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{originalObjectCode ? "Edit row" : "Add row"}</SheetTitle>
          </SheetHeader>
          {editing ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1 text-sm">
              <div>
                <label htmlFor="oc" className="text-xs font-medium">
                  Object code (PRM)
                </label>
                <Input
                  id="oc"
                  className="mt-1 font-mono text-xs"
                  value={editing.object_code}
                  onChange={(e) => setEditing({ ...editing, object_code: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="obis" className="text-xs font-medium">
                  OBIS (6-group)
                </label>
                <Input
                  id="obis"
                  className="mt-1 font-mono text-xs"
                  value={editing.obis}
                  onChange={(e) => setEditing({ ...editing, obis: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="oname" className="text-xs font-medium">
                  Object name
                </label>
                <Input
                  id="oname"
                  className="mt-1"
                  value={editing.object_name}
                  onChange={(e) => setEditing({ ...editing, object_name: e.target.value })}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="cname" className="text-xs font-medium">
                    Class name
                  </label>
                  <Input
                    id="cname"
                    className="mt-1"
                    value={editing.class_name}
                    onChange={(e) => setEditing({ ...editing, class_name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="scname" className="text-xs font-medium">
                    Subclass
                  </label>
                  <Input
                    id="scname"
                    className="mt-1"
                    value={editing.subclass_name}
                    onChange={(e) => setEditing({ ...editing, subclass_name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="sn" className="text-xs font-medium">
                  SortNo
                </label>
                <Input
                  id="sn"
                  type="number"
                  className="mt-1"
                  value={editing.sort_no}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_no: Number(e.target.value) || 0, sort_order: Number(e.target.value) || 0 })
                  }
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
