import { CommandsUnifiedRunsClient } from "@/components/commands/commands-unified-runs-client"
import { PageHeader } from "@/components/shared/page-header"

export default function CommandsRunsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        subtitle="Operator-recorded runs plus legacy catalog jobs — real persisted data only."
      />
      <CommandsUnifiedRunsClient />
    </div>
  )
}
