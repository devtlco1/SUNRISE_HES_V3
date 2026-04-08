"use client"

import {
  useCan,
  useOperatorSession,
} from "@/components/rbac/operator-session-context"

type Props = {
  permission: string
  children: React.ReactNode
  /** Optional label for the denied message (page title context). */
  title?: string
}

export function PagePermissionGate({ permission, children, title }: Props) {
  const { loading } = useOperatorSession()
  const ok = useCan(permission)
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading access…</p>
    )
  }
  if (!ok) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive"
        role="alert"
      >
        {title ? (
          <span className="font-medium">{title} — </span>
        ) : null}
        You do not have access. Required permission:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{permission}</code>
      </div>
    )
  }
  return <>{children}</>
}
