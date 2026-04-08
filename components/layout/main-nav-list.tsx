"use client"

import { ChevronDownIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { NavLink } from "@/components/layout/nav-link"
import {
  configurationHubHref,
  configurationNavChildren,
} from "@/lib/configuration/modules"
import { mainNavEntries, type MainNavConfigurationItem } from "@/lib/nav/main-nav"
import { cn } from "@/lib/utils"

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
  const onHub = pathname === configurationHubHref
  const [open, setOpen] = useState(inScope)

  useEffect(() => {
    if (inScope) setOpen(true)
  }, [inScope])

  const isSidebar = variant === "sidebar"

  const hubLink = isSidebar
    ? onHub
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : inScope && !onHub
        ? "bg-sidebar-accent/45 text-sidebar-foreground"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : onHub
      ? "bg-accent text-accent-foreground"
      : inScope && !onHub
        ? "bg-accent/50 text-foreground"
        : "text-foreground/80 hover:bg-muted"

  const chevronBtn = isSidebar
    ? "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : "text-muted-foreground hover:bg-muted"

  const childBase = isSidebar
    ? "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    : "text-foreground/80 hover:bg-muted"

  const childActive = isSidebar
    ? "bg-sidebar-accent text-sidebar-accent-foreground"
    : "bg-accent text-accent-foreground"

  const childRail = isSidebar ? "border-sidebar-border" : "border-border"

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-stretch gap-0.5 rounded-md">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="nav-configuration-children"
          title={open ? "Collapse" : "Expand"}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-colors",
            chevronBtn
          )}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDownIcon
            className={cn("size-4 transition-transform", open ? "rotate-0" : "-rotate-90")}
            aria-hidden
          />
        </button>
        <Link
          href={configurationHubHref}
          onClick={onNavigate}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors",
            hubLink
          )}
        >
          <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{entry.label}</span>
        </Link>
      </div>
      {open ? (
        <ul
          id="nav-configuration-children"
          className={cn("ml-4 flex flex-col gap-0.5 border-l pl-2", childRail)}
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
