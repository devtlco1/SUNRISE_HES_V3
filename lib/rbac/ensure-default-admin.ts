import { hashPassword } from "@/lib/auth/password"
import type { RbacUser } from "@/types/rbac"

const ROLE_ADMIN = "role-admin"
export const DEFAULT_ADMIN_USER_ID = "usr-sunrise-admin"
const DEFAULT_USERNAME = "admin"
const DEFAULT_EMAIL = "admin@sunrise.local"
const DEFAULT_DISPLAY_NAME = "Administrator"
/** Initial bootstrap password — change after first login in production. */
const DEFAULT_PLAINTEXT_PASSWORD = "Admin123"

/**
 * Ensures a login-capable `admin` account exists and is wired to the admin role.
 * Does not duplicate if `username` admin already exists; repairs role/email/hash when safe.
 */
export async function ensureDefaultLoginAdmin(
  users: RbacUser[],
  nowIso: string
): Promise<{ users: RbacUser[]; changed: boolean }> {
  const idx = users.findIndex(
    (u) => u.username.toLowerCase() === DEFAULT_USERNAME
  )

  if (idx < 0) {
    return {
      users: [
        ...users,
        {
          id: DEFAULT_ADMIN_USER_ID,
          username: DEFAULT_USERNAME,
          displayName: DEFAULT_DISPLAY_NAME,
          email: DEFAULT_EMAIL,
          roleId: ROLE_ADMIN,
          active: true,
          passwordHash: await hashPassword(DEFAULT_PLAINTEXT_PASSWORD),
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
      changed: true,
    }
  }

  const u = users[idx]!
  let next: RbacUser = { ...u }
  let changed = false

  if (u.roleId !== ROLE_ADMIN) {
    next.roleId = ROLE_ADMIN
    changed = true
  }
  if (!u.email?.trim()) {
    next.email = DEFAULT_EMAIL
    changed = true
  }
  if (!u.active) {
    next.active = true
    changed = true
  }
  if (!u.passwordHash?.trim()) {
    next.passwordHash = await hashPassword(DEFAULT_PLAINTEXT_PASSWORD)
    changed = true
  }

  if (!changed) return { users, changed: false }

  next.updatedAt = nowIso
  const list = [...users]
  list[idx] = next
  return { users: list, changed: true }
}
