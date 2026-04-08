import type { Metadata } from "next"

import { ObisConfigCatalogClient } from "@/components/obis/obis-config-catalog-client"

export const metadata: Metadata = {
  title: "OBIS catalog",
  description:
    "Vendor PRM catalog (PRM_CODE_OBIS ⋈ PRM_CODE_OBJECT). Grouped by ClassName, SubClassName, SortNo.",
}

export default function ObisConfigPage() {
  return <ObisConfigCatalogClient />
}
