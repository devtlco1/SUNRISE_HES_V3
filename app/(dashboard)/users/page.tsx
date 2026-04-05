import { TableEmpty } from "@/components/data-table/table-empty"
import { TablePagination } from "@/components/data-table/table-pagination"
import { TableShell } from "@/components/data-table/table-shell"
import { TableToolbar } from "@/components/data-table/table-toolbar"
import { FilterBar } from "@/components/shared/filter-bar"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Directory and role management placeholder — authentication not wired."
        actions={
          <Button type="button" size="sm" variant="outline" disabled>
            Invite user
          </Button>
        }
      />

      <FilterBar />

      <SectionCard title="Directory" description="User rows will appear here.">
        <TableShell>
          <TableToolbar
            left={
              <span className="text-sm text-muted-foreground">
                Role and status filters
              </span>
            }
            right={
              <Button type="button" size="sm" variant="outline" disabled>
                Export
              </Button>
            }
          />
          <TableEmpty title="No users" description="Connect identity backend on a later milestone." />
          <TablePagination page={1} pageSize={50} total={0} />
        </TableShell>
      </SectionCard>
    </div>
  )
}
