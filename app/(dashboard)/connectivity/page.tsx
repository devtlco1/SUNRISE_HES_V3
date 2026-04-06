import { ConnectivityList } from "@/components/connectivity/connectivity-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { mockConnectivityListRows } from "@/lib/mock/connectivity"

const useMockConnectivity =
  process.env.NEXT_PUBLIC_CONNECTIVITY_USE_MOCK === "true"

export default function ConnectivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Connectivity"
        subtitle={
          useMockConnectivity
            ? "Static catalog (mock mode). Clear NEXT_PUBLIC_CONNECTIVITY_USE_MOCK to use the read-only /api/connectivity feed."
            : "Read-only connectivity catalog from /api/connectivity. Search and filters run in the browser; no polling or writes in this build."
        }
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

      <ConnectivityList
        rows={useMockConnectivity ? mockConnectivityListRows : undefined}
      />
    </div>
  )
}
