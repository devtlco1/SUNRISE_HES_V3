"use client"

import { useCan } from "@/components/rbac/operator-session-context"

type Props = {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function Can({ permission, children, fallback = null }: Props) {
  const ok = useCan(permission)
  if (!ok) return <>{fallback}</>
  return <>{children}</>
}
