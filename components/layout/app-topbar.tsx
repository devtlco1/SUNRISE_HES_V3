"use client"

import { ChevronRightIcon, MenuIcon, SearchIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { SunriseLogo } from "@/components/branding/sunrise-logo"
import { MainNavList } from "@/components/layout/main-nav-list"
import { NotificationBell } from "@/components/layout/notification-bell"
import { useOperatorSession } from "@/components/rbac/operator-session-context"
import {
  configurationModuleHref,
  configurationModules,
} from "@/lib/configuration/modules"
import { cn } from "@/lib/utils"

const pathTitle: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/scanner": "Scanner",
  "/readings": "Readings",
  "/obis-config": "OBIS catalog",
  ...Object.fromEntries(
    configurationModules.map((m) => [configurationModuleHref(m), m.title])
  ),
  "/meters": "Meters",
  "/connectivity": "Connectivity · Overview",
  "/connectivity/events": "Connectivity · Events",
  "/commands": "Commands",
  "/alarms": "Alarms",
  "/users": "Users",
}

function titleFromPath(pathname: string) {
  if (/^\/connectivity\/meters\//.test(pathname)) {
    return "Connectivity · Meter"
  }
  const direct = pathTitle[pathname]
  if (direct) return direct
  let best: string | undefined
  let bestLen = 0
  for (const [prefix, title] of Object.entries(pathTitle)) {
    if (prefix === "/dashboard") continue
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (prefix.length > bestLen) {
        bestLen = prefix.length
        best = title
      }
    }
  }
  return best ?? "Operations"
}

export function AppTopbar({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const pageTitle = titleFromPath(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const { user, role, loading: sessionLoading } = useOperatorSession()

  async function logout() {
    setLogoutPending(true)
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
      router.replace("/login")
      router.refresh()
    } finally {
      setLogoutPending(false)
    }
  }

  const initials =
    user?.displayName
      ?.split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "OP"

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className
      )}
    >
      <div className="flex items-center lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" size="icon-sm" aria-label="Open menu" />
            }
          >
            <MenuIcon className="size-4" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border px-4 py-3 text-left">
              <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                <SunriseLogo className="max-h-8" />
                <span className="truncate">SUNRISE HES</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-0.5 p-2" aria-label="Mobile primary">
              <MainNavList
                variant="mobile"
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="shrink-0">Operations</span>
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0 truncate font-medium text-foreground">
            {pageTitle}
          </span>
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-6 md:block" />

      <div className="hidden w-full max-w-xs items-center gap-2 md:flex">
        <div className="relative w-full">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search (placeholder)"
            className="h-8 pl-8"
            disabled
            aria-label="Search placeholder"
          />
        </div>
      </div>

      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-background outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="User menu"
        >
          <Avatar size="sm" className="size-7 border-0 after:hidden">
            <AvatarFallback className="text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {sessionLoading ? "…" : user?.displayName ?? "No session"}
              </span>
              <span className="text-xs text-muted-foreground">
                {role ? `${role.name} · @${user?.username ?? "—"}` : "—"}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Profile</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={logoutPending}
            onClick={() => void logout()}
          >
            {logoutPending ? "Signing out…" : "Log out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
