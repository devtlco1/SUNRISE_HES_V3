import type { LucideIcon } from "lucide-react"
import {
  BellIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  RadioTowerIcon,
  SquareTerminalIcon,
  UsersIcon,
} from "lucide-react"

export type MainNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const mainNavItems: MainNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/meters", label: "Meters", icon: GaugeIcon },
  { href: "/connectivity", label: "Connectivity", icon: RadioTowerIcon },
  { href: "/commands", label: "Commands", icon: SquareTerminalIcon },
  { href: "/alarms", label: "Alarms", icon: BellIcon },
  { href: "/users", label: "Users", icon: UsersIcon },
]
