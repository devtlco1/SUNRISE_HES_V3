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
import { formatHealthState } from "@/lib/connectivity/format"
import { formatCommStatus } from "@/lib/meters/format"
import type { ConnectivityListRow } from "@/types/connectivity"

type ConnectivityDetailsSheetProps = {
  row: ConnectivityListRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Connectivity-focused detail panel; layout matches meter details discipline. */
export function ConnectivityDetailsSheet({
  row,
  open,
  onOpenChange,
}: ConnectivityDetailsSheetProps) {
  const comm = row ? formatCommStatus(row.commState) : null
  const health = row ? formatHealthState(row.healthState) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-lg"
        showCloseButton
      >
        {row ? (
          <>
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle className="text-base">Connectivity details</SheetTitle>
              <SheetDescription className="text-sm">
                {row.serialNumber} · {row.networkType}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-5 py-4">
              <DetailBlock title="Identity">
                <DlGrid
                  items={[
                    { label: "Meter ID", value: row.id },
                    { label: "Serial number", value: row.serialNumber },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Communication">
                <div className="flex flex-wrap items-center gap-2">
                  {comm ? (
                    <StatusBadge variant={comm.variant}>{comm.label}</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Signal / quality:{" "}
                  <span className="font-medium text-foreground">
                    {row.signalQuality}
                  </span>
                </p>
              </DetailBlock>

              <Separator />

              <DetailBlock title="Route / network">
                <DlGrid
                  items={[
                    { label: "Network type", value: row.networkType },
                    { label: "Route ID", value: row.routeId },
                    { label: "Gateway / DCU", value: row.gatewayId },
                    { label: "Endpoint", value: row.endpoint },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Timestamps">
                <DlGrid
                  items={[
                    {
                      label: "Last communication",
                      value: (
                        <span className="tabular-nums">
                          {row.lastCommunicationAt}
                        </span>
                      ),
                    },
                    {
                      label: "Last successful read",
                      value: (
                        <span className="tabular-nums">
                          {row.lastSuccessfulReadAt}
                        </span>
                      ),
                    },
                  ]}
                />
              </DetailBlock>

              <Separator />

              <DetailBlock title="Health / retry">
                <p className="text-sm text-foreground">
                  Session health is derived from poll success, ACK latency, and
                  retry budget (illustrative).
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {health ? (
                    <StatusBadge variant={health.variant}>{health.label}</StatusBadge>
                  ) : null}
                </div>
              </DetailBlock>

              <Separator />

              <DetailBlock title="Technical">
                <DlGrid
                  items={[
                    {
                      label: "Firmware",
                      value: (
                        <span className="font-mono text-xs">
                          {row.firmwareVersion}
                        </span>
                      ),
                    },
                    {
                      label: "Protocol",
                      value: row.protocolVersion,
                    },
                  ]}
                />
              </DetailBlock>
            </div>
          </>
        ) : (
          <SheetHeader className="px-5 py-4 text-left">
            <SheetTitle>Connectivity details</SheetTitle>
            <SheetDescription>Select an endpoint to inspect.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
