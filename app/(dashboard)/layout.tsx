import type { Metadata } from "next"

import { DashboardShell } from "@/components/layout/dashboard-shell"

export const metadata: Metadata = {
  title: "Operations",
  description: "Head-end system operations dashboard (UI foundation).",
}

export default function DashboardGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <DashboardShell>{children}</DashboardShell>
    </div>
  )
}
