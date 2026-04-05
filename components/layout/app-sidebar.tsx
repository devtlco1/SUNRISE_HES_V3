import Link from "next/link"

import { NavLink } from "@/components/layout/nav-link"
import { Separator } from "@/components/ui/separator"
import { mainNavItems } from "@/lib/nav/main-nav"
import { cn } from "@/lib/utils"

export function AppSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex h-14 items-center px-4">
        <Link
          href="/dashboard"
          className="text-sm font-semibold tracking-tight text-sidebar-foreground"
        >
          SUNRISE HES
        </Link>
      </div>
      <Separator className="bg-sidebar-border" />
      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Primary">
        {mainNavItems.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href}>
            <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Operations console — UI foundation only.
        </p>
      </div>
    </aside>
  )
}
