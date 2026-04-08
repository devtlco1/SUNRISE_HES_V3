import { ConnectivityOverview } from "@/components/connectivity/connectivity-overview"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function ConnectivityOverviewPage() {
  return (
    <PagePermissionGate permission="connectivity.view" title="Connectivity">
      <ConnectivityOverview />
    </PagePermissionGate>
  )
}
