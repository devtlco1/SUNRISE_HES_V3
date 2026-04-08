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
  formatOperationalSeverity,
  formatOperationalStatus,
} from "@/lib/alarms/operational-format"
import { operationalAlarmHref } from "@/lib/alarms/notification-filter"
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import {
  operationalSheetBodyScroll,
  operationalSheetContentNarrow,
  operationalSheetHeader,
  operationalSheetHeaderPlaceholder,
} from "@/lib/ui/operational"
import type { OperationalAlarmRecord } from "@/types/operational-alarm"
import Link from "next/link"

type Props = {
  alarm: OperationalAlarmRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OperationalAlarmDetailsSheet({
  alarm,
  open,
  onOpenChange,
}: Props) {
  const sev = alarm ? formatOperationalSeverity(alarm.severity) : null
  const st = alarm ? formatOperationalStatus(alarm.status) : null
  const href = alarm ? operationalAlarmHref(alarm) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={operationalSheetContentNarrow}
        showCloseButton
      >
        {alarm ? (
          <>
            <SheetHeader className={operationalSheetHeader}>
              <SheetTitle>{alarm.title}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {alarm.id}
              </SheetDescription>
            </SheetHeader>

            <div className={operationalSheetBodyScroll}>
              <DetailBlock title="Severity & status">
                <div className="flex flex-wrap gap-2">
                  {sev ? (
                    <StatusBadge variant={sev.variant}>{sev.label}</StatusBadge>
                  ) : null}
                  {st ? (
                    <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                  ) : null}
                </div>
              </DetailBlock>

              <Separator />

              <DetailBlock title="Message">
                <p className="text-sm text-muted-foreground">{alarm.message}</p>
              </DetailBlock>

              <Separator />

              <DetailBlock title="Source">
                <DlGrid
                  items={[
                    { label: "Source type", value: alarm.sourceType },
                    { label: "Alarm type", value: alarm.alarmType },
                    { label: "Source id", value: alarm.sourceId ?? "—" },
                    { label: "Meter id", value: alarm.meterId ?? "—" },
                    { label: "Serial", value: alarm.meterSerial ?? "—" },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Timestamps">
                <DlGrid
                  items={[
                    {
                      label: "Created",
                      value: (
                        <span className="tabular-nums">
                          {formatOperatorDateTime(alarm.createdAt)}
                        </span>
                      ),
                    },
                    {
                      label: "Updated",
                      value: (
                        <span className="tabular-nums">
                          {formatOperatorDateTime(alarm.updatedAt)}
                        </span>
                      ),
                    },
                    {
                      label: "Cleared",
                      value: (
                        <span className="tabular-nums">
                          {alarm.clearedAt
                            ? formatOperatorDateTime(alarm.clearedAt)
                            : "—"}
                        </span>
                      ),
                    },
                  ]}
                />
              </DetailBlock>

              {href ? (
                <>
                  <Separator />
                  <Link
                    href={href}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open related page
                  </Link>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <SheetHeader className={operationalSheetHeaderPlaceholder}>
            <SheetTitle>Alarm</SheetTitle>
            <SheetDescription>Select a row to inspect.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
