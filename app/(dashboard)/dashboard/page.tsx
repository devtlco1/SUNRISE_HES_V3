import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function DashboardHomePage() {
  return (
    <PagePermissionGate permission="dashboard.view" title="Dashboard">
      <DashboardHomeClient />
    </PagePermissionGate>
  )
}
