import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { mockMeterConnectivityRows } from "@/lib/mock/meters"
import type { MeterConnectivityRow } from "@/types/table"

function linkBadgeVariant(
  status: MeterConnectivityRow["linkStatus"]
): "success" | "warning" | "danger" {
  switch (status) {
    case "online":
      return "success"
    case "degraded":
      return "warning"
    default:
      return "danger"
  }
}

function linkLabel(status: MeterConnectivityRow["linkStatus"]) {
  switch (status) {
    case "online":
      return "Online"
    case "degraded":
      return "Degraded"
    default:
      return "Offline"
  }
}

export default function ConnectivityPage() {
  const rows = mockMeterConnectivityRows
  const total = rows.length
  const pageSize = 10
  const page = 1

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connectivity"
        subtitle="Reference table layout for future list pages — mock endpoints and link state only."
      />

      <FilterBar />

      <SectionCard
        title="Endpoints"
        description="Illustrative connectivity rows; not live telemetry."
      >
        <TableShell>
          <TableToolbar
            left={
              <Input
                className="h-8 max-w-xs"
                placeholder="Search serial or channel…"
                disabled
                aria-label="Search placeholder"
              />
            }
            right={
              <>
                <Button type="button" size="sm" variant="outline" disabled>
                  Refresh
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled>
                  Column visibility
                </Button>
              </>
            }
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Meter</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium tabular-nums">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.channel}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.lastSeen}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge variant={linkBadgeVariant(row.linkStatus)}>
                      {linkLabel(row.linkStatus)}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
          />
        </TableShell>
      </SectionCard>
    </div>
  )
}
