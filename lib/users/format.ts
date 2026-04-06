import type { StatusBadgeVariant } from "@/components/shared/status-badge"
import type { UserAccountStatus, UserRole } from "@/types/user"

export function formatUserRole(r: UserRole): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<UserRole, string> = {
    operator: "Operator",
    supervisor: "Supervisor",
    admin: "Admin",
    readonly: "Read-only",
    integration: "Integration",
  }
  const variant: Record<UserRole, StatusBadgeVariant> = {
    operator: "neutral",
    supervisor: "warning",
    admin: "info",
    readonly: "neutral",
    integration: "warning",
  }
  return { variant: variant[r], label: labels[r] }
}

export function formatUserStatus(s: UserAccountStatus): {
  variant: StatusBadgeVariant
  label: string
} {
  const labels: Record<UserAccountStatus, string> = {
    active: "Active",
    inactive: "Inactive",
    suspended: "Suspended",
    invited: "Invited",
  }
  const variant: Record<UserAccountStatus, StatusBadgeVariant> = {
    active: "success",
    inactive: "neutral",
    suspended: "danger",
    invited: "info",
  }
  return { variant: variant[s], label: labels[s] }
}
