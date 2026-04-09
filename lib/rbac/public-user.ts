import type { RbacUser } from "@/types/rbac"

/** Strip server-only fields before JSON responses or client session payloads. */
export function toPublicRbacUser(u: RbacUser): RbacUser {
  if (!u.passwordHash) return u
  const { passwordHash: _h, ...rest } = u
  return rest
}

export function toPublicRbacUsers(list: RbacUser[]): RbacUser[] {
  return list.map(toPublicRbacUser)
}
