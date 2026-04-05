import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"

export default function AlarmsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarms"
        subtitle="Alarm triage and acknowledgement flows will use the shared list layout."
        actions={
          <Button type="button" size="sm" variant="outline" disabled>
            Acknowledge selected
          </Button>
        }
      />

      <FilterBar />

      <SectionCard title="Open alarms" description="No alarm feed connected.">
        <TableShell>
          <TableToolbar
            left={
              <span className="text-sm text-muted-foreground">
                Severity and region filters
              </span>
            }
          />
          <TableEmpty title="No active alarms" />
          <TablePagination page={1} pageSize={15} total={0} />
        </TableShell>
      </SectionCard>
    </div>
  )
}
