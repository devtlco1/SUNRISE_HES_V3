import type { LucideIcon } from "lucide-react"
import {
  ActivityIcon,
  BellIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  RadioTowerIcon,
  ScanLineIcon,
  Settings2Icon,
  SquareTerminalIcon,
  UsersIcon,
} from "lucide-react"

/** Single top-level link (sidebar + mobile). */
export type MainNavLinkItem = {
  kind: "link"
  href: string
  label: string
  icon: LucideIcon
}

/** Expandable Configuration group; children come from `lib/configuration/modules`. */
export type MainNavConfigurationItem = {
  kind: "configuration"
  label: string
  icon: LucideIcon
}

/** Expandable Connectivity group; children from `lib/connectivity/nav`. */
export type MainNavConnectivityItem = {
  kind: "connectivity"
  label: string
  icon: LucideIcon
}

/** Expandable Commands group; children from `lib/commands/nav`. */
export type MainNavCommandsItem = {
  kind: "commands"
  label: string
  icon: LucideIcon
}

export type MainNavEntry =
  | MainNavLinkItem
  | MainNavConfigurationItem
  | MainNavConnectivityItem
  | MainNavCommandsItem

export const mainNavEntries: MainNavEntry[] = [
  { kind: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { kind: "link", href: "/scanner", label: "Scanner", icon: ScanLineIcon },
  { kind: "link", href: "/readings", label: "Readings", icon: ActivityIcon },
  { kind: "link", href: "/obis-config", label: "OBIS catalog", icon: ListTreeIcon },
  { kind: "configuration", label: "Configuration", icon: Settings2Icon },
  { kind: "link", href: "/meters", label: "Meters", icon: GaugeIcon },
  { kind: "connectivity", label: "Connectivity", icon: RadioTowerIcon },
  { kind: "commands", label: "Commands", icon: SquareTerminalIcon },
  { kind: "link", href: "/alarms", label: "Alarms", icon: BellIcon },
  { kind: "link", href: "/users", label: "Users", icon: UsersIcon },
]
