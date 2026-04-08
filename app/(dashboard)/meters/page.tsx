import { Suspense } from "react"

import { PagePermissionGate } from "@/components/rbac/page-permission-gate"
import { MetersPageClient } from "@/components/meters/meters-page-client"

const useMockMeters = process.env.NEXT_PUBLIC_METERS_USE_MOCK === "true"

export default function MetersPage() {
  return (
    <PagePermissionGate permission="meters.view" title="Meters">
      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-10 w-48 animate-pulse rounded-md bg-muted/40" />
            <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/20" />
          </div>
        }
      >
        <MetersPageClient useMockMeters={useMockMeters} />
      </Suspense>
    </PagePermissionGate>
  )
}
