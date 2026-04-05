import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"

export default function CommandsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Commands"
        subtitle="Command queue and history will adopt this table shell — execution not implemented."
        actions={
          <Button type="button" size="sm" disabled>
            New command
          </Button>
        }
      />

      <FilterBar />

      <SectionCard title="Command activity" description="Placeholder grid.">
        <TableShell>
          <TableToolbar
            left={
              <span className="text-sm text-muted-foreground">
                Status and type filters
              </span>
            }
            right={
              <Button type="button" size="sm" variant="outline" disabled>
                Export
              </Button>
            }
          />
          <TableEmpty title="No commands to show" />
          <TablePagination page={1} pageSize={20} total={0} />
        </TableShell>
      </SectionCard>
    </div>
  )
}
