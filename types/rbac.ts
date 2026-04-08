/**
 * Role-based access control — persisted users/roles + centralized permission keys.
 */

export type RbacUser = {
  id: string
  username: string
  displayName: string
  email: string
  roleId: string
  active: boolean
  /** Pending onboarding — no outbound email is sent by this build. */
  invitePending?: boolean
  invitedAt?: string
  /** Optional operator metadata */
  team?: string
  phone?: string
  assignedScope?: string
  createdAt: string
  updatedAt: string
}

export type RbacRole = {
  id: string
  name: string
  description: string
  permissionKeys: string[]
  createdAt: string
  updatedAt: string
}

export type PermissionDefinition = {
  key: string
  module: string
  group: string
  label: string
  description?: string
}

/** Resolved session for API + client `/api/rbac/me`. */
export type RbacSessionPayload = {
  user: RbacUser
  role: RbacRole
  permissions: string[]
}
