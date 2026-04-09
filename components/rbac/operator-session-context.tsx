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
  error: string | null
  reload: () => Promise<void>
}

const defaultCtx: OperatorSessionState = {
  loading: true,
  user: null,
  role: null,
  permissions: new Set(),
  error: null,
  reload: async () => undefined,
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
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rbac/me", { cache: "no-store", credentials: "include" })
      if (!res.ok) {
        setError(`Session HTTP ${res.status}`)
        setUser(null)
        setRole(null)
        setPermissionList([])
        return
      }
      const data = (await res.json()) as {
        user: RbacUser
        role: RbacRole
        permissions: string[]
      }
      setUser(data.user)
      setRole(data.role)
      setPermissionList(data.permissions)
      setError(null)
    } catch {
      setError("Session load failed")
      setUser(null)
      setRole(null)
      setPermissionList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const value = useMemo<OperatorSessionState>(
    () => ({
      loading,
      user,
      role,
      permissions: new Set(permissionList),
      error,
      reload: load,
    }),
    [loading, user, role, permissionList, error, load]
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
