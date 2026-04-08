"use client"

import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Can } from "@/components/rbac/can"
import { useCan } from "@/components/rbac/operator-session-context"
import { PERMISSION_REGISTRY } from "@/lib/rbac/permission-registry"
import type { PermissionDefinition, RbacRole, RbacUser } from "@/types/rbac"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

type TabId = "users" | "roles" | "permissions"

function parseTab(s: string | null): TabId {
  if (s === "roles" || s === "permissions") return s
  return "users"
}

export function AccessControlWorkspaceClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = useMemo(
    () => parseTab(searchParams.get("tab")),
    [searchParams]
  )

  const setTab = useCallback(
    (t: TabId) => {
      router.replace(`/users?tab=${t}`, { scroll: false })
    },
    [router]
  )

  useEffect(() => {
    if (searchParams.get("tab") == null) {
      router.replace("/users?tab=users", { scroll: false })
    }
  }, [router, searchParams])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Access control"
        subtitle="Users, roles, and the permission catalog. Session operator is selected from the header menu."
      />
      <div
        className="flex flex-wrap gap-1 border-b border-border pb-2"
        role="tablist"
        aria-label="Access control sections"
      >
        <TabButton
          id="users"
          label="Users"
          active={tab === "users"}
          onClick={() => setTab("users")}
        />
        <TabButton
          id="roles"
          label="Roles"
          active={tab === "roles"}
          onClick={() => setTab("roles")}
        />
        <TabButton
          id="permissions"
          label="Permissions"
          active={tab === "permissions"}
          onClick={() => setTab("permissions")}
        />
      </div>
      <div role="tabpanel">
        {tab === "users" ? <UsersRbacPanel /> : null}
        {tab === "roles" ? <RolesRbacPanel /> : null}
        {tab === "permissions" ? <PermissionsCatalogPanel /> : null}
      </div>
    </div>
  )
}

function TabButton({
  id,
  label,
  active,
  onClick,
}: {
  id: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      id={`ac-tab-${id}`}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function UsersRbacPanel() {
  const canView = useCan("users.view")
  const canCreate = useCan("users.create")
  const canEdit = useCan("users.edit")
  const canDelete = useCan("users.delete")

  const [users, setUsers] = useState<RbacUser[]>([])
  const [roles, setRoles] = useState<RbacRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RbacUser | null>(null)
  const [saving, setSaving] = useState(false)

  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [roleId, setRoleId] = useState("")
  const [active, setActive] = useState(true)

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [ur, rr] = await Promise.all([
        fetch("/api/rbac/users", { credentials: "include" }),
        fetch("/api/rbac/roles", { credentials: "include" }),
      ])
      if (!ur.ok) throw new Error("Users load failed")
      if (!rr.ok) throw new Error("Roles load failed")
      setUsers(await ur.json())
      setRoles(await rr.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [canView])

  useEffect(() => {
    void load()
  }, [load])

  const rolesById = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles]
  )

  function openCreate() {
    setEditing(null)
    setUsername("")
    setDisplayName("")
    setEmail("")
    setRoleId(roles[0]?.id ?? "")
    setActive(true)
    setSheetOpen(true)
  }

  function openEdit(u: RbacUser) {
    setEditing(u)
    setUsername(u.username)
    setDisplayName(u.displayName)
    setEmail(u.email)
    setRoleId(u.roleId)
    setActive(u.active)
    setSheetOpen(true)
  }

  async function saveUser() {
    setSaving(true)
    try {
      const body = {
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        roleId,
        active,
      }
      const url = editing
        ? `/api/rbac/users/${encodeURIComponent(editing.id)}`
        : "/api/rbac/users"
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? "Save failed")
      }
      setSheetOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function deactivateUser(id: string) {
    if (!window.confirm("Deactivate this user?")) return
    const res = await fetch(`/api/rbac/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!res.ok) {
      setError("Deactivate failed")
      return
    }
    await load()
  }

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You need <code className="text-xs">users.view</code> to manage accounts.
      </p>
    )
  }

  return (
    <SectionCard title="Users" description="Assign each user exactly one role.">
      <div className="space-y-3 border-t border-border px-5 py-4">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Can permission="users.create">
            <Button type="button" size="sm" onClick={openCreate}>
              New user
            </Button>
          </Can>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.displayName}</TableCell>
                  <TableCell className="text-xs">{u.username}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell className="text-xs">
                    {rolesById.get(u.roleId)?.name ?? u.roleId}
                  </TableCell>
                  <TableCell className="text-xs">{u.active ? "yes" : "no"}</TableCell>
                  <TableCell className="text-right">
                    <Can permission="users.edit">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </Button>
                    </Can>
                    <Can permission="users.delete">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive"
                        disabled={!u.active}
                        onClick={() => void deactivateUser(u.id)}
                      >
                        Deactivate
                      </Button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>{editing ? "Edit user" : "New user"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Username</span>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!!editing}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Display name</span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Email</span>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Role</span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>Active</span>
            </label>
            <Button
              type="button"
              disabled={
                saving ||
                !username.trim() ||
                !displayName.trim() ||
                !roleId ||
                (editing ? !canEdit : !canCreate)
              }
              onClick={() => void saveUser()}
            >
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </SectionCard>
  )
}

function groupByModule(
  defs: PermissionDefinition[]
): Map<string, PermissionDefinition[]> {
  const m = new Map<string, PermissionDefinition[]>()
  for (const d of defs) {
    const arr = m.get(d.module) ?? []
    arr.push(d)
    m.set(d.module, arr)
  }
  return m
}

function RolesRbacPanel() {
  const canManage = useCan("users.roles.manage")
  const [roles, setRoles] = useState<RbacRole[]>([])
  const [users, setUsers] = useState<RbacUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RbacRole | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rr, ur] = await Promise.all([
        fetch("/api/rbac/roles", { credentials: "include" }),
        fetch("/api/rbac/users", { credentials: "include" }),
      ])
      if (!rr.ok) throw new Error("Roles load failed")
      setRoles(await rr.json())
      setUsers(ur.ok ? await ur.json() : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canManage) {
      setLoading(false)
      return
    }
    void load()
  }, [canManage, load])

  const userCountByRole = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of users) {
      if (!u.active) continue
      m.set(u.roleId, (m.get(u.roleId) ?? 0) + 1)
    }
    return m
  }, [users])

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setSelectedKeys(new Set())
    setSheetOpen(true)
  }

  function openEdit(r: RbacRole) {
    setEditing(r)
    setName(r.name)
    setDescription(r.description)
    setSelectedKeys(new Set(r.permissionKeys))
    setSheetOpen(true)
  }

  function toggleKey(k: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  async function saveRole() {
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        permissionKeys: [...selectedKeys],
      }
      const url = editing
        ? `/api/rbac/roles/${encodeURIComponent(editing.id)}`
        : "/api/rbac/roles"
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? "Save failed")
      }
      setSheetOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function deleteRole(id: string) {
    if (!window.confirm("Delete this role? Users must not reference it.")) return
    const res = await fetch(`/api/rbac/roles/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setError(j.error ?? "Delete failed")
      return
    }
    await load()
  }

  const grouped = useMemo(
    () => groupByModule(PERMISSION_REGISTRY),
    []
  )

  if (!canManage) {
    return (
      <SectionCard title="Roles" description="Role definitions and permission sets.">
        <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          You need <code className="text-xs">users.roles.manage</code> to edit roles.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Roles" description="Create roles and attach granular permissions.">
      <div className="space-y-3 border-t border-border px-5 py-4">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" onClick={openCreate}>
            New role
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="tabular-nums">Permissions</TableHead>
                <TableHead className="tabular-nums">Active users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {r.description}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {r.permissionKeys.length}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {userCountByRole.get(r.id) ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive"
                      onClick={() => void deleteRole(r.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full max-w-lg flex-col gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>{editing ? "Edit role" : "New role"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Description</span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="text-xs font-semibold text-muted-foreground">
              Permissions ({selectedKeys.size} selected)
            </div>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-md border border-border p-3">
              {[...grouped.entries()].map(([mod, defs]) => (
                <div key={mod}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                    {mod}
                  </div>
                  <ul className="space-y-1.5">
                    {defs.map((d) => (
                      <li key={d.key} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(d.key)}
                          onChange={() => toggleKey(d.key)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {d.key}
                          </span>
                          <br />
                          {d.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Button
              type="button"
              disabled={saving || !name.trim()}
              onClick={() => void saveRole()}
            >
              Save role
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </SectionCard>
  )
}

function PermissionsCatalogPanel() {
  const canSee =
    useCan("users.permissions.view") || useCan("users.roles.manage")
  const [defs, setDefs] = useState<PermissionDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canSee) {
      setLoading(false)
      return
    }
    void fetch("/api/rbac/permissions", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Load failed")
        const data = (await res.json()) as { permissions: PermissionDefinition[] }
        setDefs(data.permissions)
      })
      .catch(() => setError("Could not load catalog"))
      .finally(() => setLoading(false))
  }, [canSee])

  const grouped = useMemo(() => groupByModule(defs), [defs])

  if (!canSee) {
    return (
      <SectionCard title="Permissions" description="Master catalog of keys.">
        <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          You need <code className="text-xs">users.permissions.view</code> or{" "}
          <code className="text-xs">users.roles.manage</code>.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Permission catalog"
      description="Reference list — roles grant subsets of these keys."
    >
      <div className="border-t border-border px-5 py-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            {[...grouped.entries()].map(([mod, list]) => (
              <div key={mod}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {mod}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Key</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Group</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((d) => (
                      <TableRow key={d.key}>
                        <TableCell className="font-mono text-[11px]">
                          {d.key}
                        </TableCell>
                        <TableCell className="text-xs">{d.label}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.group}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
