"use client"

import {
  DetailBlock,
  DlGrid,
} from "@/components/shared/entity-detail-blocks"
import { StatusBadge } from "@/components/shared/status-badge"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  formatAlarmState,
  formatCommStatus,
  formatPhaseTypeLong,
  formatRelayStatus,
} from "@/lib/meters/format"
import type { MeterListRow } from "@/types/meter"

type MeterDetailsSheetProps = {
  meter: MeterListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Reusable operational detail surface for a meter row (sheet / drawer pattern). */
export function MeterDetailsSheet({
  meter,
  open,
  onOpenChange,
}: MeterDetailsSheetProps) {
  const comm = meter ? formatCommStatus(meter.commStatus) : null
  const relay = meter ? formatRelayStatus(meter.relayStatus) : null
  const alarm = meter ? formatAlarmState(meter.alarmState) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-lg"
        showCloseButton
      >
        {meter ? (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle className="text-base">Meter details</SheetTitle>
              <SheetDescription className="text-sm">
                {meter.serialNumber} · {meter.customerName}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-5 py-4">
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
            </div>
          </>
        ) : (
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>Meter details</SheetTitle>
            <SheetDescription>Select a meter to inspect.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
