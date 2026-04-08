import { cookies } from "next/headers"

import { ensureRbacSeed } from "@/lib/rbac/seed-defaults"
import { filterValidPermissionKeys } from "@/lib/rbac/permission-registry"
import { readRbacRolesUnsafe, readRbacUsersUnsafe } from "@/lib/rbac/json-store"
import type { RbacSessionPayload } from "@/types/rbac"

export const OPERATOR_USER_COOKIE = "sunrise_operator_user_id"

/**
 * Resolves the active operator from cookie, or the first admin-capable user as bootstrap default.
 */
export async function getRbacSession(): Promise<RbacSessionPayload | null> {
  await ensureRbacSeed()
  const users = await readRbacUsersUnsafe()
  const roles = await readRbacRolesUnsafe()
  const jar = await cookies()
  let userId = jar.get(OPERATOR_USER_COOKIE)?.value?.trim() || null

  if (!userId) {
    const adminRole = roles.find((r) => r.name === "admin")
    const fallback =
      users.find((u) => u.active && adminRole && u.roleId === adminRole.id) ??
      users.find((u) => u.active)
    userId = fallback?.id ?? null
  }

  if (!userId) return null
  const user = users.find((u) => u.id === userId)
  if (!user || !user.active) return null
  const role = roles.find((r) => r.id === user.roleId)
  if (!role) return null
  const permissions = filterValidPermissionKeys(role.permissionKeys)
  return { user, role, permissions }
}
