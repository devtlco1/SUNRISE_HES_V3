"use client"

import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { NavLink } from "@/components/layout/nav-link"
import {
  configurationHubHref,
  configurationNavChildren,
} from "@/lib/configuration/modules"
import {
  commandsNavChildren,
  commandsChildActive,
  commandsScopeActive,
} from "@/lib/commands/nav"
import {
  connectivityNavChildren,
  connectivityChildActive,
  connectivityScopeActive,
} from "@/lib/connectivity/nav"
import {
  mainNavEntries,
  type MainNavCommandsItem,
  type MainNavConfigurationItem,
  type MainNavConnectivityItem,
} from "@/lib/nav/main-nav"
import { cn } from "@/lib/utils"

const CONFIG_NAV_OPEN_KEY = "sunrise-nav-configuration-open"
const CONNECTIVITY_NAV_OPEN_KEY = "sunrise-nav-connectivity-open"
const COMMANDS_NAV_OPEN_KEY = "sunrise-nav-commands-open"

type MainNavListProps = {
  variant: "sidebar" | "mobile"
  onNavigate?: () => void
}

function linkActive(pathname: string, href: string): boolean {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(`${href}/`)
}

function MainNavFlatLink({
  href,
  label,
  icon: Icon,
  variant,
  onNavigate,
}: {
  href: string
  label: string
  icon: LucideIcon
  variant: "sidebar" | "mobile"
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = linkActive(pathname, href)

  if (variant === "mobile") {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-accent text-accent-foreground"
            : "text-foreground/80 hover:bg-muted"
        )}
      >
        <Icon className="size-4 opacity-80" aria-hidden />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <NavLink href={href}>
      <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
      <span>{label}</span>
    </NavLink>
  )
}

function configurationScopeActive(pathname: string): boolean {
  return pathname === configurationHubHref || pathname.startsWith(`${configurationHubHref}/`)
}

function ConfigurationNavGroup({
  entry,
  variant,
  onNavigate,
}: {
  entry: MainNavConfigurationItem
  variant: "sidebar" | "mobile"
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const Icon = entry.icon
  const inScope = configurationScopeActive(pathname)
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(CONFIG_NAV_OPEN_KEY)
      if (s === "1") setOpen(true)
      else if (s === "0") setOpen(false)
      else if (configurationScopeActive(pathname)) setOpen(true)
    } catch {
      if (configurationScopeActive(pathname)) setOpen(true)
    }
    setHydrated(true)
    // Intentionally mount-only: pathname is read once for default when no stored preference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(CONFIG_NAV_OPEN_KEY, open ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [open, hydrated])

  const isSidebar = variant === "sidebar"

  const parentRow = isSidebar
    ? inScope
      ? "bg-sidebar-accent/45 text-sidebar-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : inScope
      ? "bg-accent/50 text-foreground"
      : "text-foreground/80 hover:bg-muted"

  const childBase = isSidebar
    ? "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : "text-foreground/80 hover:bg-muted"

  const childActive = isSidebar
    ? "bg-sidebar-accent text-sidebar-accent-foreground"
    : "bg-accent text-accent-foreground"

  const childRail = isSidebar ? "border-sidebar-border" : "border-border"

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="nav-configuration-children"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors outline-none",
          parentRow
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
        <span className="truncate">{entry.label}</span>
      </button>
      {open ? (
        <ul
          id="nav-configuration-children"
          className={cn("ml-2 flex flex-col gap-0.5 border-l pl-2", childRail)}
          role="list"
        >
          {configurationNavChildren.map((child) => {
            const childMatch = pathname === child.href
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    childMatch ? childActive : childBase
                  )}
                >
                  {child.label}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function CommandsNavGroup({
  entry,
  variant,
  onNavigate,
}: {
  entry: MainNavCommandsItem
  variant: "sidebar" | "mobile"
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const Icon = entry.icon
  const inScope = commandsScopeActive(pathname)
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(COMMANDS_NAV_OPEN_KEY)
      if (s === "1") setOpen(true)
      else if (s === "0") setOpen(false)
      else if (commandsScopeActive(pathname)) setOpen(true)
    } catch {
      if (commandsScopeActive(pathname)) setOpen(true)
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(COMMANDS_NAV_OPEN_KEY, open ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [open, hydrated])

  const isSidebar = variant === "sidebar"

  const parentRow = isSidebar
    ? inScope
      ? "bg-sidebar-accent/45 text-sidebar-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : inScope
      ? "bg-accent/50 text-foreground"
      : "text-foreground/80 hover:bg-muted"

  const childBase = isSidebar
    ? "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : "text-foreground/80 hover:bg-muted"

  const childActive = isSidebar
    ? "bg-sidebar-accent text-sidebar-accent-foreground"
    : "bg-accent text-accent-foreground"

  const childRail = isSidebar ? "border-sidebar-border" : "border-border"

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="nav-commands-children"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors outline-none",
          parentRow
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
        <span className="truncate">{entry.label}</span>
      </button>
      {open ? (
        <ul
          id="nav-commands-children"
          className={cn("ml-2 flex flex-col gap-0.5 border-l pl-2", childRail)}
          role="list"
        >
          {commandsNavChildren.map((child) => {
            const childMatch = commandsChildActive(pathname, child.href)
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    childMatch ? childActive : childBase
                  )}
                >
                  {child.label}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function ConnectivityNavGroup({
  entry,
  variant,
  onNavigate,
}: {
  entry: MainNavConnectivityItem
  variant: "sidebar" | "mobile"
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const Icon = entry.icon
  const inScope = connectivityScopeActive(pathname)
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(CONNECTIVITY_NAV_OPEN_KEY)
      if (s === "1") setOpen(true)
      else if (s === "0") setOpen(false)
      else if (connectivityScopeActive(pathname)) setOpen(true)
    } catch {
      if (connectivityScopeActive(pathname)) setOpen(true)
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(CONNECTIVITY_NAV_OPEN_KEY, open ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [open, hydrated])

  const isSidebar = variant === "sidebar"

  const parentRow = isSidebar
    ? inScope
      ? "bg-sidebar-accent/45 text-sidebar-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : inScope
      ? "bg-accent/50 text-foreground"
      : "text-foreground/80 hover:bg-muted"

  const childBase = isSidebar
    ? "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : "text-foreground/80 hover:bg-muted"

  const childActive = isSidebar
    ? "bg-sidebar-accent text-sidebar-accent-foreground"
    : "bg-accent text-accent-foreground"

  const childRail = isSidebar ? "border-sidebar-border" : "border-border"

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="nav-connectivity-children"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors outline-none",
          parentRow
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
        <span className="truncate">{entry.label}</span>
      </button>
      {open ? (
        <ul
          id="nav-connectivity-children"
          className={cn("ml-2 flex flex-col gap-0.5 border-l pl-2", childRail)}
          role="list"
        >
          {connectivityNavChildren.map((child) => {
            const childMatch = connectivityChildActive(pathname, child.href)
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    childMatch ? childActive : childBase
                  )}
                >
                  {child.label}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export function MainNavList({ variant, onNavigate }: MainNavListProps) {
  return (
    <>
      {mainNavEntries.map((entry) => {
        if (entry.kind === "configuration") {
          return (
            <ConfigurationNavGroup
              key="configuration"
              entry={entry}
              variant={variant}
              onNavigate={onNavigate}
            />
          )
        }
        if (entry.kind === "connectivity") {
          return (
            <ConnectivityNavGroup
              key="connectivity"
              entry={entry}
              variant={variant}
              onNavigate={onNavigate}
            />
          )
        }
        if (entry.kind === "commands") {
          return (
            <CommandsNavGroup
              key="commands"
              entry={entry}
              variant={variant}
              onNavigate={onNavigate}
            />
          )
        }
        return (
          <MainNavFlatLink
            key={entry.href}
            href={entry.href}
            label={entry.label}
            icon={entry.icon}
            variant={variant}
            onNavigate={onNavigate}
          />
        )
      })}
    </>
  )
}
