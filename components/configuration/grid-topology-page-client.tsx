"use client"

import { ConfigurationCsvToolbar } from "@/components/configuration/configuration-csv-toolbar"
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
import { allocateConfigId } from "@/lib/configuration/config-id"
import {
  operationalSheetBodyScroll,
  operationalSheetContentNarrow,
  operationalSheetHeader,
} from "@/lib/ui/operational"
import type {
  FeederRow,
  GridTopologyDoc,
  TransformerRow,
  ZoneRow,
} from "@/types/configuration"
import { useCallback, useEffect, useState } from "react"

type EditKind = "feeder" | "transformer" | "zone"

type EditState =
  | { kind: "feeder"; row: FeederRow; creating: boolean }
  | { kind: "transformer"; row: TransformerRow; creating: boolean }
  | { kind: "zone"; row: ZoneRow; creating: boolean }

function emptyFeeder(): FeederRow {
  return { id: "", code: "", name: "", notes: "" }
}

function emptyTransformer(): TransformerRow {
  return { id: "", code: "", name: "", feederId: "", notes: "" }
}

function emptyZone(): ZoneRow {
  return { id: "", code: "", name: "", feederId: "", notes: "" }
}

function selectCls() {
  return "mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
}

export function GridTopologyPageClient() {
  const [doc, setDoc] = useState<GridTopologyDoc | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<Record<EditKind, string | null>>({
    feeder: null,
    transformer: null,
    zone: null,
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoadErr(null)
    try {
      const r = await fetch("/api/configuration/grid-topology", { cache: "no-store" })
      const data = await r.json()
      if (!r.ok || !data || typeof data !== "object") {
        setLoadErr("Failed to load grid topology")
        return
      }
      const d = data as GridTopologyDoc
      if (!Array.isArray(d.feeders) || !Array.isArray(d.transformers) || !Array.isArray(d.zones)) {
        setLoadErr("Invalid grid topology payload")
        return
      }
      setDoc(d)
    } catch {
      setLoadErr("Failed to load grid topology")
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const persist = async (next: GridTopologyDoc) => {
    setSaveErr(null)
    const r = await fetch("/api/configuration/grid-topology", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      setSaveErr(typeof data?.error === "string" ? data.error : "Save failed")
      return false
    }
    setDoc(data as GridTopologyDoc)
    return true
  }

  const openFeeder = (row: FeederRow, creating: boolean) => {
    setEdit({ kind: "feeder", row: { ...row }, creating })
    setSheetOpen(true)
    setSaveErr(null)
  }

  const openTransformer = (row: TransformerRow, creating: boolean) => {
    setEdit({ kind: "transformer", row: { ...row }, creating })
    setSheetOpen(true)
    setSaveErr(null)
  }

  const openZone = (row: ZoneRow, creating: boolean) => {
    setEdit({ kind: "zone", row: { ...row }, creating })
    setSheetOpen(true)
    setSaveErr(null)
  }

  const onSaveSheet = async () => {
    if (!doc || !edit) return
    setSaving(true)
    setSaveErr(null)
    try {
      if (edit.kind === "feeder") {
        const code = edit.row.code.trim()
        const name = edit.row.name.trim()
        if (!code || !name) {
          setSaveErr("Code and name are required.")
          return
        }
        let feeders = [...doc.feeders]
        if (edit.creating) {
          const used = new Set(feeders.map((f) => f.id))
          const id = allocateConfigId("gf", code, used)
          feeders.push({
            id,
            code,
            name,
            notes: edit.row.notes.trim(),
          })
        } else {
          const idx = feeders.findIndex((f) => f.id === edit.row.id)
          if (idx < 0) return
          feeders[idx] = {
            ...edit.row,
            code,
            name,
            notes: edit.row.notes.trim(),
          }
        }
        const next = { ...doc, feeders }
        const ok = await persist(next)
        if (ok) setSheetOpen(false)
        return
      }
      if (edit.kind === "transformer") {
        const code = edit.row.code.trim()
        const name = edit.row.name.trim()
        const feederId = edit.row.feederId.trim()
        if (!code || !name || !feederId) {
          setSaveErr("Code, name, and feeder are required.")
          return
        }
        if (!doc.feeders.some((f) => f.id === feederId)) {
          setSaveErr("Unknown feeder.")
          return
        }
        let transformers = [...doc.transformers]
        if (edit.creating) {
          const used = new Set(transformers.map((t) => t.id))
          const id = allocateConfigId("gt", code, used)
          transformers.push({
            id,
            code,
            name,
            feederId,
            notes: edit.row.notes.trim(),
          })
        } else {
          const idx = transformers.findIndex((t) => t.id === edit.row.id)
          if (idx < 0) return
          transformers[idx] = {
            ...edit.row,
            code,
            name,
            feederId,
            notes: edit.row.notes.trim(),
          }
        }
        const ok = await persist({ ...doc, transformers })
        if (ok) setSheetOpen(false)
        return
      }
      const code = edit.row.code.trim()
      const name = edit.row.name.trim()
      const feederId = edit.row.feederId.trim()
      if (!code || !name || !feederId) {
        setSaveErr("Code, name, and feeder are required.")
        return
      }
      if (!doc.feeders.some((f) => f.id === feederId)) {
        setSaveErr("Unknown feeder.")
        return
      }
      let zones = [...doc.zones]
      if (edit.creating) {
        const used = new Set(zones.map((z) => z.id))
        const id = allocateConfigId("gz", code, used)
        zones.push({
          id,
          code,
          name,
          feederId,
          notes: edit.row.notes.trim(),
        })
      } else {
        const idx = zones.findIndex((z) => z.id === edit.row.id)
        if (idx < 0) return
        zones[idx] = {
          ...edit.row,
          code,
          name,
          feederId,
          notes: edit.row.notes.trim(),
        }
      }
      const ok = await persist({ ...doc, zones })
      if (ok) setSheetOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const deleteFeeder = async (f: FeederRow) => {
    if (!doc) return
    const hasChild =
      doc.transformers.some((t) => t.feederId === f.id) ||
      doc.zones.some((z) => z.feederId === f.id)
    if (hasChild) {
      alert("Remove transformers and zones on this feeder first.")
      return
    }
    if (!confirm(`Delete feeder ${f.code}?`)) return
    const next = { ...doc, feeders: doc.feeders.filter((x) => x.id !== f.id) }
    await persist(next)
  }

  const deleteTransformer = async (t: TransformerRow) => {
    if (!doc) return
    if (!confirm(`Delete transformer ${t.code}?`)) return
    const next = {
      ...doc,
      transformers: doc.transformers.filter((x) => x.id !== t.id),
    }
    await persist(next)
  }

  const deleteZone = async (z: ZoneRow) => {
    if (!doc) return
    if (!confirm(`Delete zone ${z.code}?`)) return
    const next = { ...doc, zones: doc.zones.filter((x) => x.id !== z.id) }
    await persist(next)
  }

  const feederLabel = (id: string) => {
    const f = doc?.feeders.find((x) => x.id === id)
    return f ? `${f.code} · ${f.name}` : id
  }

  const setImportNote = (kind: EditKind, msg: string | null) => {
    setImportMsg((m) => ({ ...m, [kind]: msg }))
    if (msg?.startsWith("Imported")) void reload()
  }

  if (!doc && loadErr) {
    return (
      <div className="space-y-4">
        <PageHeader title="Grid Topology" />
        <p className="text-sm text-destructive">{loadErr}</p>
      </div>
    )
  }

  const d = doc ?? { feeders: [], transformers: [], zones: [] }

  return (
    <div className="space-y-8">
      <PageHeader title="Grid Topology" />
      {saveErr ? <p className="text-xs text-destructive">{saveErr}</p> : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Feeders</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => openFeeder(emptyFeeder(), true)}
            >
              Add feeder
            </Button>
            <ConfigurationCsvToolbar
              exportHref="/api/configuration/grid-topology/csv?kind=feeders"
              templateHref="/api/configuration/grid-topology/csv?kind=feeders&template=1"
              importHref="/api/configuration/grid-topology/csv?kind=feeders"
              onImportDone={(m) => setImportNote("feeder", m)}
            />
          </div>
        </div>
        {importMsg.feeder ? (
          <p className="text-xs text-muted-foreground">{importMsg.feeder}</p>
        ) : null}
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Notes</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.feeders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No feeders.
                  </TableCell>
                </TableRow>
              ) : (
                d.feeders.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.code}</TableCell>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="hidden max-w-[240px] truncate text-xs text-muted-foreground sm:table-cell">
                      {f.notes || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => openFeeder(f, false)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => void deleteFeeder(f)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Transformers</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => openTransformer(emptyTransformer(), true)}
            >
              Add transformer
            </Button>
            <ConfigurationCsvToolbar
              exportHref="/api/configuration/grid-topology/csv?kind=transformers"
              templateHref="/api/configuration/grid-topology/csv?kind=transformers&template=1"
              importHref="/api/configuration/grid-topology/csv?kind=transformers"
              onImportDone={(m) => setImportNote("transformer", m)}
            />
          </div>
        </div>
        {importMsg.transformer ? (
          <p className="text-xs text-muted-foreground">{importMsg.transformer}</p>
        ) : null}
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="min-w-[140px]">Feeder</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.transformers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No transformers.
                  </TableCell>
                </TableRow>
              ) : (
                d.transformers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {feederLabel(t.feederId)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => openTransformer(t, false)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => void deleteTransformer(t)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Zones</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => openZone(emptyZone(), true)}
            >
              Add zone
            </Button>
            <ConfigurationCsvToolbar
              exportHref="/api/configuration/grid-topology/csv?kind=zones"
              templateHref="/api/configuration/grid-topology/csv?kind=zones&template=1"
              importHref="/api/configuration/grid-topology/csv?kind=zones"
              onImportDone={(m) => setImportNote("zone", m)}
            />
          </div>
        </div>
        {importMsg.zone ? (
          <p className="text-xs text-muted-foreground">{importMsg.zone}</p>
        ) : null}
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="min-w-[140px]">Feeder</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.zones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No zones.
                  </TableCell>
                </TableRow>
              ) : (
                d.zones.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell className="font-mono text-xs">{z.code}</TableCell>
                    <TableCell className="font-medium">{z.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {feederLabel(z.feederId)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => openZone(z, false)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => void deleteZone(z)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className={operationalSheetContentNarrow}
          showCloseButton
        >
          <SheetHeader className={operationalSheetHeader}>
            <SheetTitle>
              {edit?.kind === "feeder"
                ? edit.creating
                  ? "New feeder"
                  : "Edit feeder"
                : edit?.kind === "transformer"
                  ? edit.creating
                    ? "New transformer"
                    : "Edit transformer"
                  : edit?.kind === "zone"
                    ? edit.creating
                      ? "New zone"
                      : "Edit zone"
                    : "Grid entity"}
            </SheetTitle>
          </SheetHeader>
          <div className={operationalSheetBodyScroll}>
            {edit?.kind === "feeder" ? (
              <div className="space-y-3 pr-1 text-sm">
                {saveErr ? <p className="text-xs text-destructive">{saveErr}</p> : null}
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gf-code">
                    Code
                  </label>
                  <Input
                    id="gf-code"
                    className="mt-1 font-mono text-xs"
                    value={edit.row.code}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, code: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gf-name">
                    Name
                  </label>
                  <Input
                    id="gf-name"
                    className="mt-1"
                    value={edit.row.name}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, name: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gf-notes">
                    Notes
                  </label>
                  <Input
                    id="gf-notes"
                    className="mt-1"
                    value={edit.row.notes}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, notes: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
            {edit?.kind === "transformer" ? (
              <div className="space-y-3 pr-1 text-sm">
                {saveErr ? <p className="text-xs text-destructive">{saveErr}</p> : null}
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gt-code">
                    Code
                  </label>
                  <Input
                    id="gt-code"
                    className="mt-1 font-mono text-xs"
                    value={edit.row.code}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, code: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gt-name">
                    Name
                  </label>
                  <Input
                    id="gt-name"
                    className="mt-1"
                    value={edit.row.name}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, name: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gt-fdr">
                    Feeder
                  </label>
                  <select
                    id="gt-fdr"
                    className={selectCls()}
                    value={edit.row.feederId}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, feederId: e.target.value },
                      })
                    }
                  >
                    <option value="">—</option>
                    {d.feeders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} · {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gt-notes">
                    Notes
                  </label>
                  <Input
                    id="gt-notes"
                    className="mt-1"
                    value={edit.row.notes}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, notes: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
            {edit?.kind === "zone" ? (
              <div className="space-y-3 pr-1 text-sm">
                {saveErr ? <p className="text-xs text-destructive">{saveErr}</p> : null}
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gz-code">
                    Code
                  </label>
                  <Input
                    id="gz-code"
                    className="mt-1 font-mono text-xs"
                    value={edit.row.code}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, code: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gz-name">
                    Name
                  </label>
                  <Input
                    id="gz-name"
                    className="mt-1"
                    value={edit.row.name}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, name: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gz-fdr">
                    Feeder
                  </label>
                  <select
                    id="gz-fdr"
                    className={selectCls()}
                    value={edit.row.feederId}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, feederId: e.target.value },
                      })
                    }
                  >
                    <option value="">—</option>
                    {d.feeders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} · {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="gz-notes">
                    Notes
                  </label>
                  <Input
                    id="gz-notes"
                    className="mt-1"
                    value={edit.row.notes}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        row: { ...edit.row, notes: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
          <SheetFooter className="gap-2 border-t border-border pt-3">
            <Button
              type="button"
              size="sm"
              disabled={saving || !edit}
              onClick={() => void onSaveSheet()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setSheetOpen(false)}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
