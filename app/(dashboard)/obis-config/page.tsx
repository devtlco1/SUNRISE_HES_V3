import type { Metadata } from "next"

import { ObisConfigCatalogClient } from "@/components/obis/obis-config-catalog-client"

export const metadata: Metadata = {
  title: "OBIS catalog",
  description: "OBIS definitions and read packs for operator readings.",
}

export default function ObisConfigPage() {
  return <ObisConfigCatalogClient />
}
