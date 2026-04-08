import { CommandGroupsPageClient } from "@/components/commands/command-groups-page-client"
import { PageHeader } from "@/components/shared/page-header"

export default function CommandsGroupsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        subtitle="Saved meter groups for batch targeting (data/command-groups.json)."
      />
      <CommandGroupsPageClient />
    </div>
  )
}
