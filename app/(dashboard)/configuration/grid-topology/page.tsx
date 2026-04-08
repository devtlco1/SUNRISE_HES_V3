import { GridTopologyPageClient } from "@/components/configuration/grid-topology-page-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function GridTopologyConfigurationPage() {
  return (
    <PagePermissionGate permission="configuration.grid_topology.view" title="Grid topology">
      <GridTopologyPageClient />
    </PagePermissionGate>
  )
}
