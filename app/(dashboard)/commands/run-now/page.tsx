import { CommandsRunNowClient } from "@/components/commands/commands-run-now-client"
import { PageHeader } from "@/components/shared/page-header"

export default function CommandsRunNowPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Run now"
        subtitle="Compose target + action; the server queues and executes against the Python sidecar (direct TCP path)."
      />
      <CommandsRunNowClient />
    </div>
  )
}
