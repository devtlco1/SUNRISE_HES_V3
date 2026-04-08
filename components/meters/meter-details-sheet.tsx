"use client"

import {
  DetailBlock,
  DlGrid,
} from "@/components/shared/entity-detail-blocks"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  deleteMeter,
  postMeterFull,
  putMeter,
} from "@/lib/meters/api"
import {
  formatAlarmState,
  formatCommStatus,
  formatPhaseTypeLong,
  formatRelayStatus,
} from "@/lib/meters/format"
import {
  operationalSheetBodyScroll,
  operationalSheetContentNarrow,
  operationalSheetHeader,
  operationalSheetHeaderPlaceholder,
} from "@/lib/ui/operational"
import type {
  MeterAlarmState,
  MeterCommStatus,
  MeterListRow,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"
import { useCallback, useEffect, useState } from "react"

export type MeterSheetIntent = "add" | "detail"

type MeterDetailsSheetProps = {
  meter: MeterListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `add` opens an empty form; `detail` shows the selected meter. */
  intent: MeterSheetIntent
  /** When opening a detail row, start in the edit form instead of view. */
  formInitially?: boolean
  /** When true, no API calls (mock / static list). */
  staticMode?: boolean
  onAfterMutation?: () => void
}

function stampLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${mo}-${da} ${h}:${mi}`
}

function emptyAdd(): MeterListRow {
  const t = stampLocal()
  return {
    id: "",
    serialNumber: "",
    customerName: "—",
    feeder: "—",
    transformer: "—",
    zone: "—",
    manufacturer: "—",
    model: "—",
    commStatus: "offline",
    relayStatus: "unknown",
    lastReadingAt: t,
    lastCommunicationAt: t,
    alarmState: "none",
    phaseType: "single",
    firmwareVersion: "—",
  }
}

const phaseOptions: { v: MeterPhaseType; label: string }[] = [
  { v: "single", label: "Single-phase" },
  { v: "three_wye", label: "Three-phase wye" },
  { v: "three_delta", label: "Three-phase delta" },
]

const commOptions: MeterCommStatus[] = ["online", "offline", "degraded", "dormant"]
const relayOptions: MeterRelayStatus[] = ["energized", "open", "unknown", "test"]
const alarmOptions: MeterAlarmState[] = ["none", "warning", "critical"]

function fieldLabel(id: string, text: string) {
  return (
    <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
      {text}
    </label>
  )
}

function selectClass() {
  return "mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
}

export function MeterDetailsSheet({
  meter,
  open,
  onOpenChange,
  intent,
  formInitially = false,
  staticMode = false,
  onAfterMutation,
}: MeterDetailsSheetProps) {
  const [ui, setUi] = useState<"view" | "form">("view")
  const [draft, setDraft] = useState<MeterListRow>(emptyAdd())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (intent === "add") {
      setDraft(emptyAdd())
      setUi("form")
    } else if (meter) {
      setDraft({ ...meter })
      setUi(formInitially ? "form" : "view")
    }
  }, [open, intent, meter?.id, meter?.serialNumber, formInitially])

  const close = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const onSave = useCallback(async () => {
    if (staticMode) return
    const serial = draft.serialNumber.trim()
    if (!serial) {
      setError("Serial number is required.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (intent === "add") {
        const payload: Record<string, unknown> = {
          ...draft,
          serialNumber: serial,
        }
        if (!draft.id.trim()) {
          delete payload.id
        }
        const r = await postMeterFull(
          payload as Partial<MeterListRow> & { serialNumber: string }
        )
        if (!r.ok) {
          setError(r.error)
          return
        }
        onAfterMutation?.()
        close()
        return
      }
      if (!meter) return
      const r = await putMeter({ ...draft, serialNumber: serial, id: meter.id })
      if (!r.ok) {
        setError(r.error)
        return
      }
      onAfterMutation?.()
      close()
    } finally {
      setSaving(false)
    }
  }, [staticMode, draft, intent, meter, onAfterMutation, close])

  const onDelete = useCallback(async () => {
    if (staticMode || !meter) return
    if (
      !confirm(
        `Delete meter ${meter.serialNumber} (${meter.id}) from the registry?`
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const r = await deleteMeter({ id: meter.id })
      if (!r.ok) {
        setError(r.error)
        return
      }
      onAfterMutation?.()
      close()
    } finally {
      setDeleting(false)
    }
  }, [staticMode, meter, onAfterMutation, close])

  const showForm = intent === "add" || ui === "form"
  const m = showForm ? draft : meter

  const comm = m ? formatCommStatus(m.commStatus) : null
  const relay = m ? formatRelayStatus(m.relayStatus) : null
  const alarm = m ? formatAlarmState(m.alarmState) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={operationalSheetContentNarrow}
        showCloseButton
      >
        {!m && intent !== "add" ? (
          <SheetHeader className={operationalSheetHeaderPlaceholder}>
            <SheetTitle>Meter</SheetTitle>
            <SheetDescription>Select a meter row.</SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader className={operationalSheetHeader}>
              <SheetTitle>
                {intent === "add" ? "Add meter" : "Meter details"}
              </SheetTitle>
              <SheetDescription>
                {intent === "add"
                  ? "Enter registry fields, then save."
                  : `${meter?.serialNumber ?? ""} · ${meter?.customerName ?? ""}`}
              </SheetDescription>
            </SheetHeader>

            <div className={operationalSheetBodyScroll}>
              {showForm ? (
                <div className="space-y-4 pr-1 text-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Identity
                  </p>
                  <div>
                    {fieldLabel("m-id", "Internal ID (optional for new)")}
                    <Input
                      id="m-id"
                      className="mt-1 font-mono text-xs"
                      value={draft.id}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, id: e.target.value }))
                      }
                      disabled={intent === "detail"}
                      placeholder="Auto if empty"
                    />
                  </div>
                  <div>
                    {fieldLabel("m-ser", "Serial number")}
                    <Input
                      id="m-ser"
                      className="mt-1 font-mono text-xs"
                      value={draft.serialNumber}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, serialNumber: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-cust", "Customer / account")}
                    <Input
                      id="m-cust"
                      className="mt-1"
                      value={draft.customerName}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, customerName: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-ph", "Phase")}
                    <select
                      id="m-ph"
                      className={selectClass()}
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

                  <Separator />

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </p>
                  <div>
                    {fieldLabel("m-fdr", "Feeder")}
                    <Input
                      id="m-fdr"
                      className="mt-1"
                      value={draft.feeder}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, feeder: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-tx", "Transformer")}
                    <Input
                      id="m-tx"
                      className="mt-1"
                      value={draft.transformer}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, transformer: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-zone", "Zone")}
                    <Input
                      id="m-zone"
                      className="mt-1"
                      value={draft.zone}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, zone: e.target.value }))
                      }
                    />
                  </div>

                  <Separator />

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Communication
                  </p>
                  <div>
                    {fieldLabel("m-comm", "Comm status")}
                    <select
                      id="m-comm"
                      className={selectClass()}
                      value={draft.commStatus}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          commStatus: e.target.value as MeterCommStatus,
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
                    {fieldLabel("m-lc", "Last comm")}
                    <Input
                      id="m-lc"
                      className="mt-1 font-mono text-xs tabular-nums"
                      value={draft.lastCommunicationAt}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          lastCommunicationAt: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <Separator />

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Relay
                  </p>
                  <div>
                    {fieldLabel("m-rel", "Relay status")}
                    <select
                      id="m-rel"
                      className={selectClass()}
                      value={draft.relayStatus}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          relayStatus: e.target.value as MeterRelayStatus,
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

                  <Separator />

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Readings & alarms
                  </p>
                  <div>
                    {fieldLabel("m-lr", "Last reading")}
                    <Input
                      id="m-lr"
                      className="mt-1 font-mono text-xs tabular-nums"
                      value={draft.lastReadingAt}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, lastReadingAt: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-al", "Alarm state")}
                    <select
                      id="m-al"
                      className={selectClass()}
                      value={draft.alarmState}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          alarmState: e.target.value as MeterAlarmState,
                        }))
                      }
                    >
                      {alarmOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Separator />

                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Technical
                  </p>
                  <div>
                    {fieldLabel("m-mfr", "Manufacturer")}
                    <Input
                      id="m-mfr"
                      className="mt-1"
                      value={draft.manufacturer}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, manufacturer: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-mdl", "Model")}
                    <Input
                      id="m-mdl"
                      className="mt-1"
                      value={draft.model}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, model: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    {fieldLabel("m-fw", "Firmware")}
                    <Input
                      id="m-fw"
                      className="mt-1 font-mono text-xs"
                      value={draft.firmwareVersion}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          firmwareVersion: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : meter ? (
                <>
                  <DetailBlock title="Identity">
                    <DlGrid
                      items={[
                        { label: "Meter ID", value: meter.id },
                        { label: "Serial number", value: meter.serialNumber },
                        {
                          label: "Customer / account",
                          value: meter.customerName,
                        },
                        {
                          label: "Phase",
                          value: formatPhaseTypeLong(meter.phaseType),
                        },
                      ]}
                    />
                  </DetailBlock>
                  <Separator />
                  <DetailBlock title="Location">
                    <DlGrid
                      items={[
                        { label: "Feeder", value: meter.feeder },
                        { label: "Transformer", value: meter.transformer },
                        { label: "Zone", value: meter.zone },
                      ]}
                    />
                  </DetailBlock>
                  <Separator />
                  <DetailBlock title="Communication">
                    <div className="flex flex-wrap items-center gap-2">
                      {comm ? (
                        <StatusBadge variant={comm.variant}>{comm.label}</StatusBadge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        Last comm{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          {meter.lastCommunicationAt}
                        </span>
                      </span>
                    </div>
                  </DetailBlock>
                  <DetailBlock title="Relay">
                    <div className="flex flex-wrap items-center gap-2">
                      {relay ? (
                        <StatusBadge variant={relay.variant}>{relay.label}</StatusBadge>
                      ) : null}
                    </div>
                  </DetailBlock>
                  <Separator />
                  <DetailBlock title="Readings & alarms">
                    <DlGrid
                      items={[
                        {
                          label: "Last reading",
                          value: (
                            <span className="tabular-nums">
                              {meter.lastReadingAt}
                            </span>
                          ),
                        },
                        {
                          label: "Alarm state",
                          value: alarm ? (
                            <StatusBadge variant={alarm.variant}>
                              {alarm.label}
                            </StatusBadge>
                          ) : null,
                        },
                      ]}
                    />
                  </DetailBlock>
                  <Separator />
                  <DetailBlock title="Technical">
                    <DlGrid
                      items={[
                        { label: "Manufacturer", value: meter.manufacturer },
                        { label: "Model", value: meter.model },
                        {
                          label: "Firmware",
                          value: (
                            <span className="font-mono text-xs">
                              {meter.firmwareVersion}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </DetailBlock>
                </>
              ) : null}
            </div>

            <SheetFooter className="gap-2 border-t border-border pt-3">
              {error ? (
                <p className="w-full text-xs text-destructive">{error}</p>
              ) : null}
              {showForm ? (
                <div className="flex w-full flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={staticMode || saving}
                    onClick={() => void onSave()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving || deleting}
                    onClick={() => {
                      if (intent === "add") close()
                      else if (meter) {
                        setDraft({ ...meter })
                        setUi("view")
                        setError(null)
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : meter && intent === "detail" ? (
                <div className="flex w-full flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={staticMode}
                    onClick={() => {
                      setDraft({ ...meter })
                      setUi("form")
                      setError(null)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={staticMode || deleting}
                    onClick={() => void onDelete()}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              ) : null}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
