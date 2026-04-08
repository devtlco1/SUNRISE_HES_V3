/**
 * Reference-data modules under Configuration (operator shell).
 * Relations here are contractual for future phases — not enforced at runtime yet.
 */

import type { LucideIcon } from "lucide-react"
import {
  BellRingIcon,
  IdCardIcon,
  ListTreeIcon,
  RadioIcon,
  ReceiptIcon,
  WaypointsIcon,
} from "lucide-react"

export const configurationHubHref = "/configuration" as const

export type ConfigurationModuleId =
  | "meter-profiles"
  | "grid-topology"
  | "tariff-profiles"
  | "obis-profiles"
  | "communication-profiles"
  | "alarm-profiles"

export type ConfigurationModuleDefinition = {
  id: ConfigurationModuleId
  /** Path segment after /configuration/ */
  segment: string
  title: string
  /** One line for hub cards */
  summary: string
  /**
   * Intended data role (for docs / typed routing). Not persisted or validated yet.
   * Meter profiles: default property sets; future links to tariff, OBIS, communication, alarm profiles.
   * Grid Topology: electrical hierarchy — feeders, transformers, zones and relationships.
   */
  domainNote: string
  icon: LucideIcon
}

export const configurationModules: readonly ConfigurationModuleDefinition[] = [
  {
    id: "meter-profiles",
    segment: "meter-profiles",
    title: "Meter Profiles",
    summary: "Default meter property templates for the registry.",
    domainNote:
      "Reference fixed/default meter fields; future links to tariff, OBIS, communication, and alarm profiles.",
    icon: IdCardIcon,
  },
  {
    id: "grid-topology",
    segment: "grid-topology",
    title: "Grid Topology",
    summary: "Feeders, transformers, zones — grid hierarchy and relationships.",
    domainNote:
      "Electrical grid reference entities and how feeders, transformers, and zones relate.",
    icon: WaypointsIcon,
  },
  {
    id: "tariff-profiles",
    segment: "tariff-profiles",
    title: "Tariff Profiles",
    summary: "Tariff definitions assignable to meter profiles or meters later.",
    domainNote: "Tariff / rate profiles for assignment to meter profiles or individual meters.",
    icon: ReceiptIcon,
  },
  {
    id: "obis-profiles",
    segment: "obis-profiles",
    title: "OBIS Profiles",
    summary: "Reusable OBIS sets derived from the canonical catalog.",
    domainNote:
      "Named OBIS bundles for reads and reporting — sourced from the OBIS catalog, not a second catalog.",
    icon: ListTreeIcon,
  },
  {
    id: "communication-profiles",
    segment: "communication-profiles",
    title: "Communication Profiles",
    summary: "Runtime and transport defaults for compatible meters.",
    domainNote: "Communication / adapter defaults for meter classes or meter profiles.",
    icon: RadioIcon,
  },
  {
    id: "alarm-profiles",
    segment: "alarm-profiles",
    title: "Alarm Profiles",
    summary: "Alarm mapping, thresholds, and severity rules.",
    domainNote: "Alarm profile definitions for mapping events, thresholds, and severity.",
    icon: BellRingIcon,
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

export const PLACEHOLDER_READY_LINE =
  "This module shell is ready for the next implementation phase." as const
