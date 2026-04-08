import type { Metadata } from "next"
import { Suspense } from "react"

import { ReadingsWorkspaceClient } from "@/components/readings/readings-workspace-client"

export const metadata: Metadata = {
  title: "Readings",
  description:
    "Operator workspace: inbound modem listener, staged socket, identity and basic-register reads.",
}

export default function ReadingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <div className="h-9 max-w-lg animate-pulse rounded-md bg-muted/40" />
          <div className="h-48 animate-pulse rounded-lg border border-border bg-muted/20" />
        </div>
      }
    >
      <ReadingsWorkspaceClient />
    </Suspense>
  )
}
