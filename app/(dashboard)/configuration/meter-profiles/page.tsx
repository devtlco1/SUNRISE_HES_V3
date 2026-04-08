import { MeterProfilesPageClient } from "@/components/configuration/meter-profiles-page-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function MeterProfilesConfigurationPage() {
  return (
    <PagePermissionGate permission="configuration.meter_profiles.view" title="Meter profiles">
      <MeterProfilesPageClient />
    </PagePermissionGate>
  )
}
