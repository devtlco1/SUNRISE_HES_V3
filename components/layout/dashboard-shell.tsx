import { DashboardShellInner } from "@/components/layout/dashboard-shell-inner"

type DashboardShellProps = {
  children: React.ReactNode
  className?: string
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return <DashboardShellInner className={className}>{children}</DashboardShellInner>
}
