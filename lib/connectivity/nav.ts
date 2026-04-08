/**
 * Connectivity hub + sidebar children (same pattern as `lib/configuration/modules`).
 */

export const connectivityHubHref = "/connectivity" as const

export const connectivityNavChildren: { href: string; label: string }[] = [
  { href: "/connectivity", label: "Overview" },
  { href: "/connectivity/events", label: "Events" },
]

export function connectivityScopeActive(pathname: string): boolean {
  return pathname === connectivityHubHref || pathname.startsWith(`${connectivityHubHref}/`)
}

/** Child row highlight: Overview only on exact hub; Events on /connectivity/events. */
export function connectivityChildActive(pathname: string, childHref: string): boolean {
  if (childHref === connectivityHubHref) {
    return pathname === connectivityHubHref
  }
  return pathname === childHref || pathname.startsWith(`${childHref}/`)
}
