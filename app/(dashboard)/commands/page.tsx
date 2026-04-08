import { Suspense } from "react"

import { CommandsWorkspaceClient } from "@/components/commands/commands-workspace-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"
import { PageHeader } from "@/components/shared/page-header"

export default function CommandsPage() {
  return (
    <PagePermissionGate permission="commands.view" title="Commands">
      <div className="space-y-6">
        <PageHeader
          title="Commands"
          subtitle="Meter groups, OBIS/actions, schedules, and runs in one workspace."
        />
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <CommandsWorkspaceClient />
        </Suspense>
      </div>
    </PagePermissionGate>
  )
}
