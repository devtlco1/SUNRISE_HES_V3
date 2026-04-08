"use client"

import { ConfigurationCsvToolbar } from "@/components/configuration/configuration-csv-toolbar"
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
import { configurationHubHref } from "@/lib/configuration/modules"
import {
  operationalSheetBodyScroll,
  operationalSheetContentNarrow,
  operationalSheetHeader,
} from "@/lib/ui/operational"
import type { TariffProfileRow } from "@/types/configuration"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

function emptyDraft(): TariffProfileRow {
  return {
    id: "",
    name: "",
    code: "",
    description: "",
    active: true,
    notes: "",
  }
}

export function TariffProfilesPageClient() {
  const [rows, setRows] = useState<TariffProfileRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<TariffProfileRow>(emptyDraft())
  const [creating, setCreating] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoadErr(null)
    try {
      const r = await fetch("/api/configuration/tariff-profiles", { cache: "no-store" })
      const data = await r.json()
      if (!r.ok || !Array.isArray(data)) {
        setLoadErr("Failed to load tariff profiles")
        return
      }
      setRows(data as TariffProfileRow[])
    } catch {
      setLoadErr("Failed to load tariff profiles")
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const openCreate = () => {
    setCreating(true)
    setDraft(emptyDraft())
    setFormErr(null)
    setSheetOpen(true)
  }

  const openEdit = (row: TariffProfileRow) => {
    setCreating(false)
    setDraft({ ...row })
    setFormErr(null)
    setSheetOpen(true)
  }

  const onSave = async () => {
    const name = draft.name.trim()
    const code = draft.code.trim()
    if (!name || !code) {
      setFormErr("Name and code are required.")
      return
    }
    setSaving(true)
    setFormErr(null)
    try {
      if (creating) {
        const r = await fetch("/api/configuration/tariff-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code,
            description: draft.description.trim(),
            notes: draft.notes.trim(),
            active: draft.active,
          }),
        })
        const data = await r.json()
        if (!r.ok) {
          setFormErr(typeof data?.error === "string" ? data.error : "Save failed")
          return
        }
      } else {
        const r = await fetch("/api/configuration/tariff-profiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        })
        const data = await r.json()
        if (!r.ok) {
          setFormErr(typeof data?.error === "string" ? data.error : "Save failed")
          return
        }
      }
      setSheetOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (row: TariffProfileRow) => {
    if (!confirm(`Delete tariff ${row.code} (${row.id})?`)) return
    const r = await fetch("/api/configuration/tariff-profiles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      alert(typeof data?.error === "string" ? data.error : "Delete failed")
      return
    }
    await reload()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tariff Profiles"
        actions={
          <Link
            href={configurationHubHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8"
            )}
          >
            Configuration
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" className="h-8" onClick={openCreate}>
          Add tariff
        </Button>
        <ConfigurationCsvToolbar
          exportHref="/api/configuration/tariff-profiles/export"
          templateHref="/api/configuration/tariff-profiles/template"
          importHref="/api/configuration/tariff-profiles/import-csv"
          onImportDone={(m) => {
            setImportMsg(m)
            if (m?.startsWith("Imported")) void reload()
          }}
        />
      </div>
      {importMsg ? (
        <p
          className={cn(
            "text-xs",
            importMsg.startsWith("Import failed") ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {importMsg}
        </p>
      ) : null}
      {loadErr ? (
        <p className="text-sm text-destructive">{loadErr}</p>
      ) : null}

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead className="min-w-[140px]">Name</TableHead>
              <TableHead className="min-w-[200px]">Description</TableHead>
              <TableHead className="w-[64px]">Active</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No tariff profiles yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.description || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.active ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive"
                      onClick={() => void onDelete(r)}
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className={operationalSheetContentNarrow}
          showCloseButton
        >
          <SheetHeader className={operationalSheetHeader}>
            <SheetTitle>{creating ? "New tariff profile" : "Edit tariff profile"}</SheetTitle>
          </SheetHeader>
          <div className={operationalSheetBodyScroll}>
            <div className="space-y-3 pr-1 text-sm">
              {formErr ? (
                <p className="text-xs text-destructive">{formErr}</p>
              ) : null}
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="tf-code">
                  Code
                </label>
                <Input
                  id="tf-code"
                  className="mt-1 font-mono text-xs"
                  value={draft.code}
                  onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                  disabled={!creating}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="tf-name">
                  Name
                </label>
                <Input
                  id="tf-name"
                  className="mt-1"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="tf-desc"
                >
                  Description
                </label>
                <Input
                  id="tf-desc"
                  className="mt-1"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, description: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="tf-notes">
                  Notes
                </label>
                <Input
                  id="tf-notes"
                  className="mt-1"
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                  className="rounded border-input"
                />
                Active
              </label>
            </div>
          </div>
          <SheetFooter className="gap-2 border-t border-border pt-3">
            <Button type="button" size="sm" disabled={saving} onClick={() => void onSave()}>
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
