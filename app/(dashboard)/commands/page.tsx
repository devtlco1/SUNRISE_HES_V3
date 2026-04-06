import { CommandsWorkspace } from "@/components/commands/commands-workspace"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function CommandsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Commands"
        subtitle="Draft batch requests, review job history, and inspect per-meter outcomes. Workflow is mock; execution and queues are not connected."
        actions={
          <>
            <Button type="button" size="sm" variant="outline" disabled>
              Export audit (mock)
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled>
              Job policies (mock)
            </Button>
          </>
        }
      />

      <CommandsWorkspace />
    </div>
  )
}
