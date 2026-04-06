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
  formatAlarmAck,
  formatAlarmSeverity,
  formatAlarmState,
} from "@/lib/alarms/format"
import type { AlarmListRow } from "@/types/alarm"

type AlarmDetailsSheetProps = {
  alarm: AlarmListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AlarmDetailsSheet({
  alarm,
  open,
  onOpenChange,
}: AlarmDetailsSheetProps) {
  const sev = alarm ? formatAlarmSeverity(alarm.severity) : null
  const st = alarm ? formatAlarmState(alarm.state) : null
  const ack = alarm ? formatAlarmAck(alarm.ackState) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-lg"
        showCloseButton
      >
        {alarm ? (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle className="text-base">Alarm details</SheetTitle>
              <SheetDescription className="text-sm">
                {alarm.id} · {alarm.serialNumber}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-5 py-4">
              <DetailBlock title="Identity">
                <DlGrid
                  items={[
                    { label: "Alarm ID", value: alarm.id },
                    { label: "Summary", value: alarm.summary },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Severity & state">
                <div className="flex flex-wrap gap-2">
                  {sev ? (
                    <StatusBadge variant={sev.variant}>{sev.label}</StatusBadge>
                  ) : null}
                  {st ? (
                    <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                  ) : null}
                  {ack ? (
                    <StatusBadge variant={ack.variant}>{ack.label}</StatusBadge>
                  ) : null}
                </div>
              </DetailBlock>

              <Separator />

              <DetailBlock title="Meter & location">
                <DlGrid
                  items={[
                    { label: "Meter ID", value: alarm.meterId },
                    { label: "Serial", value: alarm.serialNumber },
                    { label: "Customer / site", value: alarm.customerName },
                    { label: "Feeder", value: alarm.feeder },
                    { label: "Transformer", value: alarm.transformer },
                    { label: "Zone", value: alarm.zone },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Timestamps">
                <DlGrid
                  items={[
                    {
                      label: "First seen",
                      value: (
                        <span className="tabular-nums">{alarm.firstSeen}</span>
                      ),
                    },
                    {
                      label: "Last seen",
                      value: (
                        <span className="tabular-nums">{alarm.lastSeen}</span>
                      ),
                    },
                    {
                      label: "Occurrence count",
                      value: (
                        <span className="tabular-nums">
                          {alarm.occurrenceCount}
                        </span>
                      ),
                    },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Acknowledgement & assignment">
                <DlGrid
                  items={[
                    {
                      label: "Acknowledgement",
                      value: ack ? (
                        <StatusBadge variant={ack.variant}>{ack.label}</StatusBadge>
                      ) : null,
                    },
                    {
                      label: "Assigned to",
                      value: alarm.assignedTo ?? "—",
                    },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Technical / source">
                <DlGrid
                  items={[
                    { label: "Alarm type", value: alarm.alarmType },
                    { label: "Source / domain", value: alarm.sourceDomain },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Event history (placeholder)">
                <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
                  <li>
                    <span className="tabular-nums text-foreground">
                      {alarm.firstSeen}
                    </span>{" "}
                    — Raised ({alarm.sourceDomain})
                  </li>
                  <li>
                    <span className="tabular-nums text-foreground">
                      {alarm.lastSeen}
                    </span>{" "}
                    — Last occurrence recorded (mock)
                  </li>
                  <li>Correlation and audit trail will attach here.</li>
                </ul>
              </DetailBlock>
            </div>
          </>
        ) : (
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>Alarm details</SheetTitle>
            <SheetDescription>Select an alarm to inspect.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
