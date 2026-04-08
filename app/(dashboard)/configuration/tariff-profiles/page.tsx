import { TariffProfilesPageClient } from "@/components/configuration/tariff-profiles-page-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"

export default function TariffProfilesConfigurationPage() {
  return (
    <PagePermissionGate permission="configuration.tariff_profiles.view" title="Tariff profiles">
      <TariffProfilesPageClient />
    </PagePermissionGate>
  )
}
