import { ConnectivityList } from "@/components/connectivity/connectivity-list"
import { PageHeader } from "@/components/shared/page-header"

export default function ConnectivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Connectivity" />
      <ConnectivityList />
    </div>
  )
}
