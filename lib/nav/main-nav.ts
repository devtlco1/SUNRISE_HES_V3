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

export type MainNavItem = {
  href: string
  label: string
  icon: LucideIcon
}

export const mainNavItems: MainNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/scanner", label: "Scanner", icon: ScanLineIcon },
  { href: "/readings", label: "Readings", icon: ActivityIcon },
  { href: "/obis-config", label: "OBIS catalog", icon: ListTreeIcon },
  { href: "/configuration", label: "Configuration", icon: Settings2Icon },
  { href: "/meters", label: "Meters", icon: GaugeIcon },
  { href: "/connectivity", label: "Connectivity", icon: RadioTowerIcon },
  { href: "/commands", label: "Commands", icon: SquareTerminalIcon },
  { href: "/alarms", label: "Alarms", icon: BellIcon },
  { href: "/users", label: "Users", icon: UsersIcon },
]
