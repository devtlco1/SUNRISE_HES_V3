import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { TableShell } from "@/components/data-table/table-shell"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  mockDashboardStats,
  mockLatestCommands,
  mockRecentActivity,
} from "@/lib/mock/dashboard"
import type { LatestCommandRow } from "@/types/dashboard"

function commandStatusVariant(
  status: LatestCommandRow["status"]
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "success":
      return "success"
    case "pending":
      return "warning"
    case "failed":
      return "danger"
    default:
      return "neutral"
  }
}

function commandStatusLabel(status: LatestCommandRow["status"]) {
  switch (status) {
    case "success":
      return "Completed"
    case "pending":
      return "Pending"
    case "failed":
      return "Failed"
    default:
      return "Queued"
  }
}

export default function DashboardHomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Fleet snapshot for console review. Figures and events are illustrative until integrations are attached."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {mockDashboardStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            description={stat.description}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent activity"
          description="Cross-cutting events across meters, connectivity, and commands (illustrative)."
        >
          <ul className="divide-y divide-border rounded-md border border-border">
            {mockRecentActivity.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm text-foreground">{item.summary}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {item.tone === "success" ? (
                    <StatusBadge variant="success">OK</StatusBadge>
                  ) : null}
                  {item.tone === "warning" ? (
                    <StatusBadge variant="warning">Watch</StatusBadge>
                  ) : null}
                  {item.tone === "neutral" ? (
                    <StatusBadge variant="neutral">Info</StatusBadge>
                  ) : null}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {item.occurredAt}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Latest commands"
          description="Recent submissions using the same table chrome as the Commands workspace."
        >
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Command</TableHead>
                  <TableHead>Meter</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockLatestCommands.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {row.command}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.meterSerial}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={commandStatusVariant(row.status)}>
                        {commandStatusLabel(row.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.submittedAt}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </SectionCard>
      </div>
    </div>
  )
}
