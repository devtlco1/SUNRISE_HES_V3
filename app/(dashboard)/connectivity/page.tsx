import { ConnectivityList } from "@/components/connectivity/connectivity-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function ConnectivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Connectivity"
        subtitle="Route and session posture by meter. Values are mock; there is no live polling in this build."
        actions={
          <>
            <Button type="button" size="sm" variant="outline" disabled>
              Export (mock)
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
