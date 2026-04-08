import { filterValidPermissionKeys } from "@/lib/rbac/permission-registry"
import type { RbacRole } from "@/types/rbac"

export function permissionSetFromRole(role: RbacRole | undefined): Set<string> {
  if (!role) return new Set()
  return new Set(filterValidPermissionKeys(role.permissionKeys))
}

export function hasPermission(permissions: Set<string>, key: string): boolean {
  return permissions.has(key)
}

export function hasAnyPermission(
  permissions: Set<string>,
  keys: readonly string[]
): boolean {
  return keys.some((k) => permissions.has(k))
}
