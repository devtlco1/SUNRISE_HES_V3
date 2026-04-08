import { Suspense } from "react"
import { redirect } from "next/navigation"

import { AccessControlWorkspaceClient } from "@/components/users/access-control-workspace-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

type Props = { searchParams: Promise<{ tab?: string }> }

export default async function UsersPage({ searchParams }: Props) {
  const sp = await searchParams
  const t = sp.tab
  if (t !== "users" && t !== "roles" && t !== "permissions") {
    redirect("/users?tab=users")
  }
  return (
    <PagePermissionGate permission="users.view" title="Access control">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        }
      >
        <AccessControlWorkspaceClient />
      </Suspense>
    </PagePermissionGate>
  )
}
