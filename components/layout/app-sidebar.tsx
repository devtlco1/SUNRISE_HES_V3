import Link from "next/link"

import { SunriseLogo } from "@/components/branding/sunrise-logo"
import { MainNavList } from "@/components/layout/main-nav-list"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function AppSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex h-14 items-center px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 text-sidebar-foreground"
        >
          <SunriseLogo className="max-h-8 shrink-0" />
          <span className="truncate text-xs font-semibold tracking-tight">
            SUNRISE HES
          </span>
        </Link>
      </div>
      <Separator className="bg-sidebar-border" />
      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Primary">
        <MainNavList variant="sidebar" />
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Operations console — UI foundation only.
        </p>
      </div>
    </aside>
  )
}
