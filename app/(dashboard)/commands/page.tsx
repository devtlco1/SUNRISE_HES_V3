import { CommandsOverviewClient } from "@/components/commands/commands-overview-client"
import { PageHeader } from "@/components/shared/page-header"

export default function CommandsOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Commands"
        subtitle="Section overview — groups, schedules, and execution records. Use child pages for workflows."
      />
      <CommandsOverviewClient />
    </div>
  )
}
