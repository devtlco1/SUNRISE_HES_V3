import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"

export default function MetersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        subtitle="Meter registry and inventory views will use this layout."
        actions={
          <Button type="button" size="sm" variant="outline" disabled>
            Add meter
          </Button>
        }
      />

      <FilterBar />

      <SectionCard title="Meters" description="Placeholder list — no data wiring yet.">
        <TableShell>
          <TableToolbar
            left={
              <span className="text-sm text-muted-foreground">
                Search and filters
              </span>
            }
            right={
              <Button type="button" size="sm" variant="outline" disabled>
                Export
              </Button>
            }
          />
          <TableEmpty title="No meters loaded" />
          <TablePagination page={1} pageSize={25} total={0} />
        </TableShell>
      </SectionCard>
    </div>
  )
}
