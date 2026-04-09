"use client"

import type { RbacRole, RbacUser } from "@/types/rbac"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

export type OperatorSessionState = {
  loading: boolean
  user: RbacUser | null
  role: RbacRole | null
  permissions: Set<string>
  switchableUsers: { id: string; displayName: string; username: string }[] | null
  error: string | null
  reload: () => Promise<void>
  switchUser: (userId: string) => Promise<boolean>
}

const defaultCtx: OperatorSessionState = {
  loading: true,
  user: null,
  role: null,
  permissions: new Set(),
  switchableUsers: null,
  error: null,
  reload: async () => undefined,
  switchUser: async () => false,
}

const OperatorSessionContext = createContext<OperatorSessionState>(defaultCtx)

export function OperatorSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<RbacUser | null>(null)
  const [role, setRole] = useState<RbacRole | null>(null)
  const [permissionList, setPermissionList] = useState<string[]>([])
  const [switchableUsers, setSwitchableUsers] = useState<
    { id: string; displayName: string; username: string }[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rbac/me", { cache: "no-store", credentials: "include" })
      if (!res.ok) {
        setError(`Session HTTP ${res.status}`)
        setUser(null)
        setRole(null)
        setPermissionList([])
        setSwitchableUsers(null)
        return
      }
      const data = (await res.json()) as {
        user: RbacUser
        role: RbacRole
        permissions: string[]
        switchableUsers?: { id: string; displayName: string; username: string }[]
      }
      setUser(data.user)
      setRole(data.role)
      setPermissionList(data.permissions)
      setSwitchableUsers(data.switchableUsers ?? null)
      setError(null)
    } catch {
      setError("Session load failed")
      setUser(null)
      setRole(null)
      setPermissionList([])
      setSwitchableUsers(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const switchUser = useCallback(async (userId: string) => {
    try {
      const res = await fetch("/api/rbac/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) return false
      await load()
      return true
    } catch {
      return false
    }
  }, [load])

  const value = useMemo<OperatorSessionState>(
    () => ({
      loading,
      user,
      role,
      permissions: new Set(permissionList),
      switchableUsers,
      error,
      reload: load,
      switchUser,
    }),
    [loading, user, role, permissionList, switchableUsers, error, load, switchUser]
  )

  return (
    <OperatorSessionContext.Provider value={value}>
      {children}
    </OperatorSessionContext.Provider>
  )
}

export function useOperatorSession(): OperatorSessionState {
  return useContext(OperatorSessionContext)
}

export function useCan(permission: string): boolean {
  const { permissions, loading } = useOperatorSession()
  if (loading) return false
  return permissions.has(permission)
}

/** Distinct loading vs denied — use for toolbars so session fetch does not look like “missing permission”. */
export function usePermission(permission: string): {
  loading: boolean
  allowed: boolean
} {
  const { permissions, loading } = useOperatorSession()
  return {
    loading,
    allowed: !loading && permissions.has(permission),
  }
}

export function useAnyPermission(keys: readonly string[]): {
  loading: boolean
  allowed: boolean
} {
  const { permissions, loading } = useOperatorSession()
  return {
    loading,
    allowed: !loading && keys.some((k) => permissions.has(k)),
  }
}
