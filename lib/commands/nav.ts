/** Single workspace: `/commands` with `?tab=` (legacy child routes redirect here). */

export const commandsHubHref = "/commands" as const

export type CommandsWorkspaceTab =
  | "meter-groups"
  | "schedules"
  | "obis-groups"
  | "run"

export const commandsTabQueryValues: CommandsWorkspaceTab[] = [
  "meter-groups",
  "schedules",
  "obis-groups",
  "run",
]

export function parseCommandsTabParam(v: string | null): CommandsWorkspaceTab {
  if (
    v === "schedules" ||
    v === "obis-groups" ||
    v === "run" ||
    v === "meter-groups"
  ) {
    return v
  }
  return "meter-groups"
}

/** Legacy `/commands/*` paths → workspace tab (for redirects). */
export function commandsLegacyPathToTab(pathname: string): CommandsWorkspaceTab {
  if (pathname.startsWith("/commands/groups")) return "meter-groups"
  if (pathname.startsWith("/commands/schedules")) return "schedules"
  if (pathname.startsWith("/commands/run-now")) return "run"
  if (pathname.startsWith("/commands/runs")) return "run"
  return "meter-groups"
}
