import { CommandSchedulesPageClient } from "@/components/commands/command-schedules-page-client"
import { PageHeader } from "@/components/shared/page-header"

export default function CommandsSchedulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedules"
        subtitle="Saved cadence definitions (data/command-schedules.json). No automatic runner in Phase 1."
      />
      <CommandSchedulesPageClient />
    </div>
  )
}
