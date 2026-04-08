import { ConnectivityEventsPage } from "@/components/connectivity/connectivity-events-page"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function ConnectivityEventsRoutePage() {
  return (
    <PagePermissionGate permission="connectivity.events.view" title="Connectivity events">
      <ConnectivityEventsPage />
    </PagePermissionGate>
  )
}
