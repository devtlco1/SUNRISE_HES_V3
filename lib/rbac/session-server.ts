import { cookies } from "next/headers"

import { AUTH_SESSION_COOKIE } from "@/lib/auth/constants"
import { verifySessionTokenUserId } from "@/lib/auth/session-token"
import { ensureRbacSeed } from "@/lib/rbac/seed-defaults"
import { filterValidPermissionKeys } from "@/lib/rbac/permission-registry"
import { readRbacRolesUnsafe, readRbacUsersUnsafe } from "@/lib/rbac/json-store"
import { toPublicRbacUser } from "@/lib/rbac/public-user"
import type { RbacSessionPayload } from "@/types/rbac"

/**
 * Resolves RBAC session from the signed auth cookie only (no anonymous bootstrap).
 */
export async function getRbacSession(): Promise<RbacSessionPayload | null> {
  await ensureRbacSeed()
  const jar = await cookies()
  const raw = jar.get(AUTH_SESSION_COOKIE)?.value?.trim()
  const userId = raw ? verifySessionTokenUserId(raw) : null
  if (!userId) return null

  const users = await readRbacUsersUnsafe()
  const roles = await readRbacRolesUnsafe()
  const user = users.find((u) => u.id === userId)
  if (!user || !user.active) return null
  const role = roles.find((r) => r.id === user.roleId)
  if (!role) return null
  const permissions = filterValidPermissionKeys(role.permissionKeys)
  return {
    user: toPublicRbacUser(user),
    role,
    permissions,
  }
}
