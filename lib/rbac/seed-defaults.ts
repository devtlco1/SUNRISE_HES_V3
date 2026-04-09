import { mockUserListRows } from "@/lib/mock/users"
import type { RbacRole, RbacUser } from "@/types/rbac"

import {
  allPermissionKeys,
  filterValidPermissionKeys,
  PERMISSION_REGISTRY,
} from "@/lib/rbac/permission-registry"
import {
  readRbacRolesUnsafe,
  readRbacUsersUnsafe,
  writeRbacRoles,
  writeRbacUsers,
} from "@/lib/rbac/json-store"

const ROLE_ADMIN = "role-admin"
const ROLE_OPERATOR = "role-operator"
const ROLE_VIEWER = "role-viewer"
const ROLE_SUPPORT = "role-support"
const ROLE_DEVELOPER = "role-developer"

function nowIso() {
  return new Date().toISOString()
}

function viewOnlyKeys(): string[] {
  return PERMISSION_REGISTRY.filter(
    (p) =>
      p.key.endsWith(".view") ||
      /** Read-only operators still need tab routes to open Commands. */
      p.key.startsWith("commands.tab.")
  ).map((p) => p.key)
}

function operatorKeys(): string[] {
  const all = new Set(allPermissionKeys())
  const deny = new Set([
    "users.create",
    "users.edit",
    "users.delete",
    "users.roles.manage",
    "users.permissions.view",
    "users.session.switch",
  ])
  return [...all].filter((k) => !deny.has(k))
}

function supportKeys(): string[] {
  return [...new Set([...viewOnlyKeys(), "users.view", "alarms.preferences.manage"])]
}

function developerKeys(): string[] {
  const base = viewOnlyKeys()
  const extra = allPermissionKeys().filter(
    (k) =>
      (k.startsWith("configuration.") && k.includes("manage")) ||
      k.startsWith("obis.") ||
      k.startsWith("commands.") ||
      k === "readings.run" ||
      k === "readings.export"
  )
  return [...new Set([...base, ...extra])]
}

function defaultRoles(now: string): RbacRole[] {
  return [
    {
      id: ROLE_ADMIN,
      name: "admin",
      description: "Full system access",
      permissionKeys: allPermissionKeys(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ROLE_OPERATOR,
      name: "operator",
      description: "Day-to-day head-end operations; no access control admin",
      permissionKeys: filterValidPermissionKeys(operatorKeys()),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ROLE_VIEWER,
      name: "viewer",
      description: "Read-only across major sections",
      permissionKeys: filterValidPermissionKeys(viewOnlyKeys()),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ROLE_SUPPORT,
      name: "support",
      description: "Read-only plus alarms preferences and users directory view",
      permissionKeys: filterValidPermissionKeys(supportKeys()),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ROLE_DEVELOPER,
      name: "developer",
      description: "Configuration, OBIS, and commands management for engineering",
      permissionKeys: filterValidPermissionKeys(developerKeys()),
      createdAt: now,
      updatedAt: now,
    },
  ]
}

const LEGACY_ROLE_MAP: Record<string, string> = {
  admin: ROLE_ADMIN,
  supervisor: ROLE_SUPPORT,
  operator: ROLE_OPERATOR,
  readonly: ROLE_VIEWER,
  integration: ROLE_DEVELOPER,
}

function usersFromMock(now: string): RbacUser[] {
  return mockUserListRows.map((r) => {
    const invited = r.status === "invited"
    const active = r.status === "active"
    return {
      id: r.id,
      username: r.username,
      displayName: r.fullName,
      email: r.email,
      roleId: LEGACY_ROLE_MAP[r.role] ?? ROLE_OPERATOR,
      active,
      ...(invited
        ? { invitePending: true as const, invitedAt: now }
        : {}),
      team: r.team,
      phone: r.phone,
      assignedScope: r.assignedScope,
      createdAt: r.createdAt.includes("T") ? r.createdAt : `${r.createdAt}T00:00:00.000Z`,
      updatedAt: r.updatedAt.includes("T") ? r.updatedAt : `${r.updatedAt}T00:00:00.000Z`,
    }
  })
}

/** Keeps built-in admin aligned with the full permission catalog (registry growth / legacy JSON). */
function repairAdminFullCatalog(roles: RbacRole[], now: string): {
  next: RbacRole[]
  changed: boolean
} {
  const full = allPermissionKeys()
  let changed = false
  const next = roles.map((r) => {
    if (r.id !== ROLE_ADMIN) return r
    const keys = filterValidPermissionKeys(r.permissionKeys)
    const hasAll = full.length === keys.length && full.every((k) => keys.includes(k))
    if (hasAll) return r
    changed = true
    return { ...r, permissionKeys: full, updatedAt: now }
  })
  return { next, changed }
}

/**
 * Ensures `data/rbac-roles.json` and `data/rbac-users.json` exist with baseline content.
 */
export async function ensureRbacSeed(): Promise<void> {
  const now = nowIso()
  let roles = await readRbacRolesUnsafe()
  if (roles.length === 0) {
    roles = defaultRoles(now)
    await writeRbacRoles(roles)
  } else {
    const { next, changed } = repairAdminFullCatalog(roles, now)
    if (changed) {
      roles = next
      await writeRbacRoles(roles)
    }
  }

  let users = await readRbacUsersUnsafe()
  if (users.length === 0) {
    users = usersFromMock(now)
    await writeRbacUsers(users)
  }
}

export const SEEDED_ROLE_IDS = {
  admin: ROLE_ADMIN,
  operator: ROLE_OPERATOR,
  viewer: ROLE_VIEWER,
  support: ROLE_SUPPORT,
  developer: ROLE_DEVELOPER,
} as const
