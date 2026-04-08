/**
 * Commands hub + sidebar children (same pattern as `lib/connectivity/nav`).
 */

export const commandsHubHref = "/commands" as const

export const commandsNavChildren: { href: string; label: string }[] = [
  { href: "/commands", label: "Overview" },
  { href: "/commands/run-now", label: "Run Now" },
  { href: "/commands/groups", label: "Groups" },
  { href: "/commands/schedules", label: "Schedules" },
  { href: "/commands/runs", label: "Runs" },
]

export function commandsScopeActive(pathname: string): boolean {
  return (
    pathname === commandsHubHref || pathname.startsWith(`${commandsHubHref}/`)
  )
}

/** Overview only on exact hub; other children match exact or nested paths. */
export function commandsChildActive(
  pathname: string,
  childHref: string
): boolean {
  if (childHref === commandsHubHref) {
    return pathname === commandsHubHref
  }
  return pathname === childHref || pathname.startsWith(`${childHref}/`)
}
