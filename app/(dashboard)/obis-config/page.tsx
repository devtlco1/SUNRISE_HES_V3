import type { Metadata } from "next"

import { PagePermissionGate } from "@/components/rbac/page-permission-gate"
import { ObisConfigCatalogClient } from "@/components/obis/obis-config-catalog-client"

export const metadata: Metadata = {
  title: "OBIS catalog",
  description:
    "Vendor PRM catalog (PRM_CODE_OBIS ⋈ PRM_CODE_OBJECT). Grouped by ClassName, SubClassName, SortNo.",
}

export default function ObisConfigPage() {
  return (
    <PagePermissionGate permission="obis.catalog.view" title="OBIS catalog">
      <ObisConfigCatalogClient />
    </PagePermissionGate>
  )
}
