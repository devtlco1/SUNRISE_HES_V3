import { ConnectivityList } from "@/components/connectivity/connectivity-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function ConnectivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Connectivity"
        subtitle="Live-style monitoring of routes, gateways, and session health — mock data and client-side filters only."
        actions={
          <>
            <Button type="button" size="sm" variant="outline">
              Export
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled>
              Run poll (mock)
            </Button>
          </>
        }
      />

      <ConnectivityList />
    </div>
  )
}
