import { ConnectivityMeterDetailClient } from "@/components/connectivity/connectivity-meter-detail-client"
import { PagePermissionGate } from "@/components/rbac/page-permission-gate"
import { getConnectivityMeterDetailPayload } from "@/lib/connectivity/meter-detail-data"
import { notFound } from "next/navigation"

type Props = { params: Promise<{ meterId: string }> }

export default async function ConnectivityMeterDetailPage({ params }: Props) {
  const { meterId } = await params
  const initial = await getConnectivityMeterDetailPayload(meterId)
  if (!initial) {
    notFound()
  }
  return (
    <PagePermissionGate permission="connectivity.meters.view" title="Meter connectivity">
      <ConnectivityMeterDetailClient initial={initial} meterSlug={meterId} />
    </PagePermissionGate>
  )
}
