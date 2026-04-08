import {
  CONFIGURATION_CHILD_PERMISSIONS,
  CONFIGURATION_NAV_PERMISSIONS,
  CONNECTIVITY_CHILD_PERMISSIONS,
  CONNECTIVITY_PARENT_PERMISSIONS,
  NAV_LINK_PERMISSIONS,
} from "@/lib/rbac/permission-registry"
import { hasAnyPermission } from "@/lib/rbac/resolve"

export function navFlatLinkVisible(
  permissions: Set<string>,
  href: string
): boolean {
  const req = NAV_LINK_PERMISSIONS[href]
  if (!req) return true
  return hasAnyPermission(permissions, req.anyOf)
}

export function configurationNavGroupVisible(permissions: Set<string>): boolean {
  return hasAnyPermission(permissions, CONFIGURATION_NAV_PERMISSIONS.anyOf)
}

export function configurationChildHrefVisible(
  permissions: Set<string>,
  href: string
): boolean {
  const seg = href.replace(/^\/configuration\/?/, "").split("/")[0] ?? ""
  const req = CONFIGURATION_CHILD_PERMISSIONS[seg]
  if (!req) return false
  return hasAnyPermission(permissions, req.anyOf)
}

export function connectivityNavGroupVisible(permissions: Set<string>): boolean {
  return hasAnyPermission(permissions, CONNECTIVITY_PARENT_PERMISSIONS.anyOf)
}

export function connectivityChildHrefVisible(
  permissions: Set<string>,
  href: string
): boolean {
  const req = CONNECTIVITY_CHILD_PERMISSIONS[href]
  if (!req) return false
  return hasAnyPermission(permissions, req.anyOf)
}
