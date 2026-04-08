import { AccessControlWorkspaceClient } from "@/components/users/access-control-workspace-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function UsersPage() {
  return (
    <PagePermissionGate permission="users.view" title="Access control">
      <AccessControlWorkspaceClient />
    </PagePermissionGate>
  )
}
