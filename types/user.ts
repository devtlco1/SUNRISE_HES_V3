export type UserRole =
  | "operator"
  | "supervisor"
  | "admin"
  | "readonly"
  | "integration"

export type UserAccountStatus =
  | "active"
  | "inactive"
  | "suspended"
  | "invited"

export type UserListRow = {
  id: string
  fullName: string
  email: string
  username: string
  role: UserRole
  status: UserAccountStatus
  team: string
  assignedScope: string
  lastActiveAt: string
  createdAt: string
  updatedAt: string
  phone: string
}
