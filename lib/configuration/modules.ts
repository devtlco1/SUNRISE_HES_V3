/**
 * Configuration sub-routes (reference-data shell). Add entries here when new modules ship.
 */

import type { LucideIcon } from "lucide-react"
import { IdCardIcon, ReceiptIcon, WaypointsIcon } from "lucide-react"

export const configurationHubHref = "/configuration" as const

export type ConfigurationModuleId =
  | "meter-profiles"
  | "grid-topology"
  | "tariff-profiles"

export type ConfigurationModuleDefinition = {
  id: ConfigurationModuleId
  segment: string
  title: string
  icon: LucideIcon
}

export const configurationModules: readonly ConfigurationModuleDefinition[] = [
  {
    id: "meter-profiles",
    segment: "meter-profiles",
    title: "Meter Profiles",
    icon: IdCardIcon,
  },
  {
    id: "grid-topology",
    segment: "grid-topology",
    title: "Grid Topology",
    icon: WaypointsIcon,
  },
  {
    id: "tariff-profiles",
    segment: "tariff-profiles",
    title: "Tariff Profiles",
    icon: ReceiptIcon,
  },
] as const

const byId = Object.fromEntries(
  configurationModules.map((m) => [m.id, m])
) as Record<ConfigurationModuleId, ConfigurationModuleDefinition>

export function getConfigurationModule(
  id: ConfigurationModuleId
): ConfigurationModuleDefinition {
  return byId[id]
}

export function configurationModuleHref(
  mod: ConfigurationModuleDefinition
): string {
  return `${configurationHubHref}/${mod.segment}`
}

/** Sidebar / mobile nested links under Configuration. */
export const configurationNavChildren: { href: string; label: string }[] =
  configurationModules.map((m) => ({
    href: configurationModuleHref(m),
    label: m.title,
  }))
