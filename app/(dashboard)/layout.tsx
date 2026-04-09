import type { Metadata } from "next"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { requireAuthenticatedSession } from "@/lib/auth/require-login"

export const metadata: Metadata = {
  title: "Operations",
  description: "Head-end system operations dashboard (UI foundation).",
}

export const dynamic = "force-dynamic"

export default async function DashboardGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireAuthenticatedSession()
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <DashboardShell>{children}</DashboardShell>
    </div>
  )
}
