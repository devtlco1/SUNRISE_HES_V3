import type { PermissionDefinition } from "@/types/rbac"

function def(
  module: string,
  group: string,
  key: string,
  label: string,
  description?: string
): PermissionDefinition {
  return { module, group, key, label, description }
}

/**
 * Master permission catalog — single source of truth for keys and UI grouping.
 * Role records store `permissionKeys` as subsets of these keys.
 */
export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  def("dashboard", "Navigation · sections", "dashboard.view", "View dashboard"),

  def("scanner", "Navigation · sections", "scanner.view", "View scanner"),

  def("readings", "Navigation · sections", "readings.view", "View readings area"),
  def("readings", "Readings", "readings.run", "Execute reading / runtime actions"),
  def("readings", "Readings", "readings.export", "Export reading results"),

  def("obis", "Navigation · sections", "obis.catalog.view", "View OBIS catalog"),
  def("obis", "OBIS catalog", "obis.catalog.edit", "Edit OBIS catalog entries"),
  def("obis", "OBIS catalog", "obis.catalog.import", "Import OBIS catalog"),

  def("configuration", "Navigation · sections", "configuration.view", "View configuration hub"),
  def("configuration", "Meter profiles", "configuration.meter_profiles.view", "View meter profiles"),
  def(
    "configuration",
    "Meter profiles",
    "configuration.meter_profiles.manage",
    "Create / edit / delete meter profiles"
  ),
  def("configuration", "Grid topology", "configuration.grid_topology.view", "View grid topology"),
  def(
    "configuration",
    "Grid topology",
    "configuration.grid_topology.manage",
    "Manage grid topology"
  ),
  def("configuration", "Tariff profiles", "configuration.tariff_profiles.view", "View tariff profiles"),
  def(
    "configuration",
    "Tariff profiles",
    "configuration.tariff_profiles.manage",
    "Manage tariff profiles"
  ),

  def("meters", "Navigation · sections", "meters.view", "View meters"),
  def("meters", "Meters", "meters.create", "Create meters"),
  def("meters", "Meters", "meters.edit", "Edit meters"),
  def("meters", "Meters", "meters.delete", "Delete meters"),
  def("meters", "Meters", "meters.export", "Export meters"),
  def("meters", "Meters", "meters.import", "Import meters"),

  def("connectivity", "Navigation · sections", "connectivity.view", "View connectivity overview"),
  def("connectivity", "Navigation · sections", "connectivity.events.view", "View connectivity events"),
  def("connectivity", "Connectivity", "connectivity.meters.view", "Open meter connectivity detail"),

  def("commands", "Navigation · sections", "commands.view", "View commands workspace"),
  def("commands", "Commands · tabs", "commands.tab.meter_groups", "Meter groups tab"),
  def("commands", "Commands · tabs", "commands.tab.obis_actions", "OBIS / actions tab"),
  def("commands", "Commands · tabs", "commands.tab.schedules", "Schedules tab"),
  def("commands", "Commands · tabs", "commands.tab.run", "Run tab"),
  def("commands", "Commands · actions", "commands.groups.manage", "Manage meter groups"),
  def("commands", "Commands · actions", "commands.obis_groups.manage", "Manage OBIS / action groups"),
  def("commands", "Commands · actions", "commands.schedules.manage", "Manage schedules"),
  def("commands", "Commands · actions", "commands.run.execute", "Queue and run operator commands"),

  def("alarms", "Navigation · sections", "alarms.view", "View alarms"),
  def("alarms", "Alarms", "alarms.clear", "Clear operational alarms"),
  def("alarms", "Alarms", "alarms.preferences.manage", "Manage notification preferences"),

  def("users", "Navigation · sections", "users.view", "View access control / users area"),
  def("users", "Users", "users.create", "Create users"),
  def("users", "Users", "users.edit", "Edit users"),
  def("users", "Users", "users.delete", "Deactivate / delete users"),
  def("users", "Users", "users.roles.manage", "Manage roles and role permissions"),
  def("users", "Users", "users.permissions.view", "View permission catalog"),
  def("users", "Users", "users.session.switch", "Switch operator session (impersonation)"),
]

const KEY_SET = new Set(PERMISSION_REGISTRY.map((p) => p.key))

export function isValidPermissionKey(key: string): boolean {
  return KEY_SET.has(key)
}

export function allPermissionKeys(): string[] {
  return PERMISSION_REGISTRY.map((p) => p.key)
}

export function filterValidPermissionKeys(keys: string[]): string[] {
  return [...new Set(keys.filter((k) => KEY_SET.has(k)))]
}

export type NavPermissionRequirement = {
  /** Any of these grants access to the nav entry. */
  anyOf: string[]
}

/** Map sidebar / mobile top-level hrefs to permissions. */
export const NAV_LINK_PERMISSIONS: Record<string, NavPermissionRequirement> = {
  "/dashboard": { anyOf: ["dashboard.view"] },
  "/scanner": { anyOf: ["scanner.view"] },
  "/readings": { anyOf: ["readings.view"] },
  "/obis-config": { anyOf: ["obis.catalog.view"] },
  "/meters": { anyOf: ["meters.view"] },
  "/commands": { anyOf: ["commands.view"] },
  "/alarms": { anyOf: ["alarms.view"] },
  "/users": { anyOf: ["users.view"] },
}

/** Configuration hub parent: show if any configuration nav child is allowed OR hub view. */
export const CONFIGURATION_NAV_PERMISSIONS: NavPermissionRequirement = {
  anyOf: [
    "configuration.view",
    "configuration.meter_profiles.view",
    "configuration.grid_topology.view",
    "configuration.tariff_profiles.view",
  ],
}

/** Per configuration child href suffix after /configuration/ */
export const CONFIGURATION_CHILD_PERMISSIONS: Record<string, NavPermissionRequirement> = {
  "meter-profiles": { anyOf: ["configuration.meter_profiles.view"] },
  "grid-topology": { anyOf: ["configuration.grid_topology.view"] },
  "tariff-profiles": { anyOf: ["configuration.tariff_profiles.view"] },
}

export const CONNECTIVITY_PARENT_PERMISSIONS: NavPermissionRequirement = {
  anyOf: ["connectivity.view", "connectivity.events.view", "connectivity.meters.view"],
}

export const CONNECTIVITY_CHILD_PERMISSIONS: Record<string, NavPermissionRequirement> = {
  "/connectivity": { anyOf: ["connectivity.view"] },
  "/connectivity/events": { anyOf: ["connectivity.events.view"] },
}
