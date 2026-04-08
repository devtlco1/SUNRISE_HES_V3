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
import type { MeterProfileRow } from "@/types/configuration"
import type {
  MeterCommStatus,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

const phaseOptions: { v: MeterPhaseType; label: string }[] = [
  { v: "single", label: "Single" },
  { v: "three_wye", label: "Wye" },
  { v: "three_delta", label: "Delta" },
]

const relayOptions: MeterRelayStatus[] = [
  "energized",
  "open",
  "unknown",
  "test",
]

const commOptions: MeterCommStatus[] = [
  "online",
  "offline",
  "degraded",
  "dormant",
]

function emptyDraft(): MeterProfileRow {
  return {
    id: "",
    name: "",
    manufacturer: "",
    model: "",
    firmware: "",
    phaseType: "single",
    defaultRelayStatus: "unknown",
    defaultCommStatus: "offline",
    defaultTariffProfileId: "",
    notes: "",
    active: true,
  }
}

function selectCls() {
  return "mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
}

export function MeterProfilesPageClient() {
  const [rows, setRows] = useState<MeterProfileRow[]>([])
  const [tariffs, setTariffs] = useState<{ id: string; name: string; code: string }[]>(
    []
  )
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<MeterProfileRow>(emptyDraft())
  const [creating, setCreating] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoadErr(null)
    try {
      const [mp, tf] = await Promise.all([
        fetch("/api/configuration/meter-profiles", { cache: "no-store" }).then(
          (r) => r.json()
        ),
        fetch("/api/configuration/tariff-profiles", { cache: "no-store" }).then(
          (r) => r.json()
        ),
      ])
      if (Array.isArray(mp)) setRows(mp as MeterProfileRow[])
      else setLoadErr("Failed to load meter profiles")
      if (Array.isArray(tf))
        setTariffs(
          (tf as { id: string; name: string; code: string }[]).map((t) => ({
            id: t.id,
            name: t.name,
            code: t.code,
          }))
        )
    } catch {
      setLoadErr("Failed to load meter profiles")
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

  const openEdit = (row: MeterProfileRow) => {
    setCreating(false)
    setDraft({ ...row })
    setFormErr(null)
    setSheetOpen(true)
  }

  const onSave = async () => {
    const name = draft.name.trim()
    if (!name) {
      setFormErr("Name is required.")
      return
    }
    setSaving(true)
    setFormErr(null)
    try {
      if (creating) {
        const r = await fetch("/api/configuration/meter-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            manufacturer: draft.manufacturer.trim(),
            model: draft.model.trim(),
            firmware: draft.firmware.trim(),
            phaseType: draft.phaseType,
            defaultRelayStatus: draft.defaultRelayStatus,
            defaultCommStatus: draft.defaultCommStatus,
            defaultTariffProfileId: draft.defaultTariffProfileId.trim(),
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
        const r = await fetch("/api/configuration/meter-profiles", {
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

  const onDelete = async (row: MeterProfileRow) => {
    if (!confirm(`Delete profile ${row.name} (${row.id})?`)) return
    const r = await fetch("/api/configuration/meter-profiles", {
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

  const tariffLabel = (id: string) => {
    if (!id) return "—"
    const t = tariffs.find((x) => x.id === id)
    return t ? `${t.code} · ${t.name}` : id
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meter Profiles"
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
          Add profile
        </Button>
        <ConfigurationCsvToolbar
          exportHref="/api/configuration/meter-profiles/export"
          templateHref="/api/configuration/meter-profiles/template"
          importHref="/api/configuration/meter-profiles/import-csv"
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
            importMsg.startsWith("Import failed") || importMsg.includes("error")
              ? "text-destructive"
              : "text-muted-foreground"
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
              <TableHead className="w-[140px]">Name</TableHead>
              <TableHead className="w-[100px]">Mfr</TableHead>
              <TableHead className="w-[100px]">Model</TableHead>
              <TableHead className="w-[72px]">Phase</TableHead>
              <TableHead className="min-w-[120px]">Default tariff</TableHead>
              <TableHead className="w-[64px]">Active</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No profiles yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.manufacturer}</TableCell>
                  <TableCell className="text-muted-foreground">{r.model}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.phaseType.replace("three_", "")}
                  </TableCell>
                  <TableCell className="text-xs">{tariffLabel(r.defaultTariffProfileId)}</TableCell>
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
            <SheetTitle>{creating ? "New meter profile" : "Edit meter profile"}</SheetTitle>
          </SheetHeader>
          <div className={operationalSheetBodyScroll}>
            <div className="space-y-3 pr-1 text-sm">
              {formErr ? (
                <p className="text-xs text-destructive">{formErr}</p>
              ) : null}
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-name">
                  Name
                </label>
                <Input
                  id="mp-name"
                  className="mt-1"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-mfr">
                  Manufacturer
                </label>
                <Input
                  id="mp-mfr"
                  className="mt-1"
                  value={draft.manufacturer}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, manufacturer: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-mdl">
                  Model
                </label>
                <Input
                  id="mp-mdl"
                  className="mt-1"
                  value={draft.model}
                  onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-fw">
                  Firmware
                </label>
                <Input
                  id="mp-fw"
                  className="mt-1 font-mono text-xs"
                  value={draft.firmware}
                  onChange={(e) => setDraft((d) => ({ ...d, firmware: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-ph">
                  Phase
                </label>
                <select
                  id="mp-ph"
                  className={selectCls()}
                  value={draft.phaseType}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      phaseType: e.target.value as MeterPhaseType,
                    }))
                  }
                >
                  {phaseOptions.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-rel">
                  Default relay
                </label>
                <select
                  id="mp-rel"
                  className={selectCls()}
                  value={draft.defaultRelayStatus}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      defaultRelayStatus: e.target.value as MeterRelayStatus,
                    }))
                  }
                >
                  {relayOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-comm">
                  Default comm
                </label>
                <select
                  id="mp-comm"
                  className={selectCls()}
                  value={draft.defaultCommStatus}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      defaultCommStatus: e.target.value as MeterCommStatus,
                    }))
                  }
                >
                  {commOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-tf">
                  Default tariff profile
                </label>
                <select
                  id="mp-tf"
                  className={selectCls()}
                  value={draft.defaultTariffProfileId}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      defaultTariffProfileId: e.target.value,
                    }))
                  }
                >
                  <option value="">—</option>
                  {tariffs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="mp-notes">
                  Notes
                </label>
                <Input
                  id="mp-notes"
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
