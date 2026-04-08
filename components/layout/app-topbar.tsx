"use client"

import { ChevronRightIcon, MenuIcon, SearchIcon } from "lucide-react"
import { usePathname } from "next/navigation"
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
import { MainNavList } from "@/components/layout/main-nav-list"
import { NotificationBell } from "@/components/layout/notification-bell"
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
  const pageTitle = titleFromPath(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)

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
              <SheetTitle className="text-sm font-semibold">SUNRISE HES</SheetTitle>
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
            <AvatarFallback className="text-xs font-medium">OP</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Operator</span>
              <span className="text-xs text-muted-foreground">
                Signed-in user (placeholder)
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>Profile</DropdownMenuItem>
          <DropdownMenuItem disabled>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
