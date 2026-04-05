import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppTopbar } from "@/components/layout/app-topbar"
import { cn } from "@/lib/utils"

type DashboardShellProps = {
  children: React.ReactNode
  className?: string
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <div className="flex min-h-0 flex-1 bg-background">
      <AppSidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main
          className={cn(
            "min-h-0 flex-1 overflow-auto bg-muted/20",
            className
          )}
        >
          <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
