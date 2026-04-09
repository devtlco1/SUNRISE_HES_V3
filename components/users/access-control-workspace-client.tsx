"use client"

import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import {
  useAnyPermission,
  useCan,
  usePermission,
} from "@/components/rbac/operator-session-context"
import { BUILTIN_ROLE_ID_SET } from "@/lib/rbac/builtin-role-ids"
import { PERMISSION_REGISTRY } from "@/lib/rbac/permission-registry"
import { operationalRowActionTriggerClass } from "@/lib/ui/operational"
import { cn } from "@/lib/utils"
import type { PermissionDefinition, RbacRole, RbacUser } from "@/types/rbac"
import { MailPlus, MoreHorizontal, UserPlus } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

type TabId = "users" | "roles" | "permissions"

function parseTab(s: string | null): TabId {
  if (s === "roles" || s === "permissions") return s
  return "users"
}

export function AccessControlWorkspaceClient() {
  const searchParams = useSearchParams()
  const tab = useMemo(
    () => parseTab(searchParams.get("tab")),
    [searchParams]
  )

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
        <TabLink id="users" label="Users" active={tab === "users"} />
        <TabLink id="roles" label="Roles" active={tab === "roles"} />
        <TabLink
          id="permissions"
          label="Permissions"
          active={tab === "permissions"}
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

function TabLink({
  id,
  label,
  active,
}: {
  id: TabId
  label: string
  active: boolean
}) {
  return (
    <Link
      href={`/users?tab=${id}`}
      scroll={false}
      prefetch
      role="tab"
      aria-selected={active}
      id={`ac-tab-${id}`}
      className={cn(
        "inline-flex rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
    </Link>
  )
}

function userStatusLabel(u: RbacUser): string {
  if (u.invitePending) return "Invited"
  if (u.active) return "Active"
  return "Disabled"
}

function UsersRbacPanel() {
  const viewPerm = usePermission("users.view")
  const canView = viewPerm.allowed
  const createPerm = usePermission("users.create")
  const canEdit = useCan("users.edit")
  const canDelete = useCan("users.delete")

  const [users, setUsers] = useState<RbacUser[]>([])
  const [roles, setRoles] = useState<RbacRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [permsOpen, setPermsOpen] = useState(false)
  const [permsSubject, setPermsSubject] = useState<RbacUser | null>(null)
  const [editing, setEditing] = useState<RbacUser | null>(null)
  const [saving, setSaving] = useState(false)

  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [roleId, setRoleId] = useState("")
  const [active, setActive] = useState(true)

  const [invUsername, setInvUsername] = useState("")
  const [invDisplayName, setInvDisplayName] = useState("")
  const [invEmail, setInvEmail] = useState("")
  const [invRoleId, setInvRoleId] = useState("")

  const load = useCallback(async () => {
    if (viewPerm.loading || !viewPerm.allowed) {
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
  }, [viewPerm.loading, viewPerm.allowed])

  useEffect(() => {
    void load()
  }, [load])

  const rolesById = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles]
  )

  const effectiveKeys = useMemo(() => {
    if (!permsSubject) return []
    const role = rolesById.get(permsSubject.roleId)
    return role ? [...role.permissionKeys].sort() : []
  }, [permsSubject, rolesById])

  function openCreate() {
    setEditing(null)
    setUsername("")
    setDisplayName("")
    setEmail("")
    setRoleId(roles[0]?.id ?? "")
    setActive(true)
    setSheetOpen(true)
  }

  function openInvite() {
    setInvUsername("")
    setInvDisplayName("")
    setInvEmail("")
    setInvRoleId(roles[0]?.id ?? "")
    setInviteOpen(true)
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

  function openEffectivePerms(u: RbacUser) {
    setPermsSubject(u)
    setPermsOpen(true)
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

  async function saveInvite() {
    setSaving(true)
    try {
      const res = await fetch("/api/rbac/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: invUsername.trim(),
          displayName: invDisplayName.trim(),
          email: invEmail.trim(),
          roleId: invRoleId,
          invitePending: true,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? "Invite failed")
      }
      setInviteOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed")
    } finally {
      setSaving(false)
    }
  }

  async function disableUserAccount(u: RbacUser) {
    if (
      !window.confirm(
        "Disable this user? They will not be able to sign in until re-enabled."
      )
    )
      return
    let res: Response
    if (canEdit) {
      res = await fetch(`/api/rbac/users/${encodeURIComponent(u.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: false, invitePending: false }),
      })
    } else if (canDelete) {
      res = await fetch(`/api/rbac/users/${encodeURIComponent(u.id)}`, {
        method: "DELETE",
        credentials: "include",
      })
    } else {
      return
    }
    if (!res.ok) {
      setError("Disable failed")
      return
    }
    await load()
  }

  async function activateUser(u: RbacUser) {
    const res = await fetch(`/api/rbac/users/${encodeURIComponent(u.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        active: true,
        invitePending: false,
      }),
    })
    if (!res.ok) {
      setError("Activate failed")
      return
    }
    await load()
  }

  if (viewPerm.loading) {
    return (
      <SectionCard title="Users" description="Assign each user exactly one role.">
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          Loading users…
        </p>
      </SectionCard>
    )
  }

  if (!canView) {
    return (
      <SectionCard title="Users" description="Assign each user exactly one role.">
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          You need <code className="text-xs">users.view</code> to manage accounts.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Users" description="Assign each user exactly one role.">
      <div className="space-y-3 border-t border-border pt-3">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {createPerm.loading ? (
            <>
              <Button type="button" size="sm" disabled>
                <UserPlus className="mr-1 size-3.5" />
                Add user
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled>
                <MailPlus className="mr-1 size-3.5" />
                Invite
              </Button>
            </>
          ) : createPerm.allowed ? (
            <>
              <Button type="button" size="sm" onClick={openCreate}>
                <UserPlus className="mr-1 size-3.5" />
                Add user
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={openInvite}
              >
                <MailPlus className="mr-1 size-3.5" />
                Invite
              </Button>
            </>
          ) : null}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[52px] text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.displayName}</TableCell>
                    <TableCell className="text-xs">{u.username}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.email || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {rolesById.get(u.roleId)?.name ?? u.roleId}
                    </TableCell>
                    <TableCell className="text-xs">
                      {userStatusLabel(u)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={operationalRowActionTriggerClass}
                          aria-label={`Actions for ${u.username}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem
                            onClick={() => openEffectivePerms(u)}
                          >
                            View permissions
                          </DropdownMenuItem>
                          {canEdit ? (
                            <DropdownMenuItem onClick={() => openEdit(u)}>
                              Edit user
                            </DropdownMenuItem>
                          ) : null}
                          {canEdit ? (
                            <DropdownMenuItem onClick={() => openEdit(u)}>
                              Change role
                            </DropdownMenuItem>
                          ) : null}
                          {canEdit && !u.active ? (
                            <DropdownMenuItem
                              onClick={() => void activateUser(u)}
                            >
                              Enable user
                            </DropdownMenuItem>
                          ) : null}
                          {(canEdit || canDelete) && u.active ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => void disableUserAccount(u)}
                              >
                                Disable user
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>{editing ? "Edit user" : "Add user"}</SheetTitle>
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
                (editing ? !canEdit : !createPerm.allowed)
              }
              onClick={() => void saveUser()}
            >
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>Invite user</SheetTitle>
            <SheetDescription>
              Creates an inactive account flagged as invited. Outbound email is
              not sent from this application — share access details through your
              usual secure channel.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Username</span>
              <Input
                value={invUsername}
                onChange={(e) => setInvUsername(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Display name</span>
              <Input
                value={invDisplayName}
                onChange={(e) => setInvDisplayName(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Email (optional)</span>
              <Input
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Role</span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2"
                value={invRoleId}
                onChange={(e) => setInvRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              disabled={
                saving ||
                !invUsername.trim() ||
                !invDisplayName.trim() ||
                !invRoleId ||
                !createPerm.allowed
              }
              onClick={() => void saveInvite()}
            >
              Create invited user
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={permsOpen} onOpenChange={setPermsOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>
              Effective permissions
              {permsSubject ? ` · ${permsSubject.displayName}` : ""}
            </SheetTitle>
            <SheetDescription>
              From role{" "}
              <span className="font-medium text-foreground">
                {permsSubject
                  ? (rolesById.get(permsSubject.roleId)?.name ?? permsSubject.roleId)
                  : ""}
              </span>{" "}
              ({effectiveKeys.length} keys)
            </SheetDescription>
          </SheetHeader>
          <div className="max-h-[60vh] overflow-y-auto px-4 py-4 text-xs">
            <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {effectiveKeys.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
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

function rolePermissionDefs(role: RbacRole): PermissionDefinition[] {
  const set = new Set(role.permissionKeys)
  return PERMISSION_REGISTRY.filter((d) => set.has(d.key))
}

function RolesRbacPanel() {
  const rolesManageP = usePermission("users.roles.manage")
  const canManage = rolesManageP.allowed
  const [roles, setRoles] = useState<RbacRole[]>([])
  const [users, setUsers] = useState<RbacUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [inspectOpen, setInspectOpen] = useState(false)
  const [inspectRole, setInspectRole] = useState<RbacRole | null>(null)
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
    void load()
  }, [load])

  const userCountByRole = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of users) {
      if (!u.active) continue
      m.set(u.roleId, (m.get(u.roleId) ?? 0) + 1)
    }
    return m
  }, [users])

  const memberCountByRole = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of users) {
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

  function openInspectRole(r: RbacRole) {
    setInspectRole(r)
    setInspectOpen(true)
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

  const inspectGrouped = useMemo(
    () => groupByModule(inspectRole ? rolePermissionDefs(inspectRole) : []),
    [inspectRole]
  )

  const inspectUnknownKeys = useMemo(() => {
    if (!inspectRole) return []
    const known = new Set(PERMISSION_REGISTRY.map((d) => d.key))
    return inspectRole.permissionKeys.filter((k) => !known.has(k)).sort()
  }, [inspectRole])

  return (
    <SectionCard
      title="Roles"
      description={
        rolesManageP.loading
          ? "Loading role capabilities…"
          : canManage
            ? "Create roles and attach granular permissions."
            : "Role definitions (view only). Request users.roles.manage to edit."
      }
    >
      <div className="space-y-3 border-t border-border pt-3">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!rolesManageP.loading && !canManage ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            You can review roles below. Editing requires{" "}
            <code className="text-[11px]">users.roles.manage</code>.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {rolesManageP.loading ? (
            <Button type="button" size="sm" disabled>
              Create role
            </Button>
          ) : canManage ? (
            <Button type="button" size="sm" onClick={openCreate}>
              Create role
            </Button>
          ) : null}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="tabular-nums">Permissions</TableHead>
                  <TableHead className="tabular-nums">Members</TableHead>
                  <TableHead className="w-[52px] text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => {
                  const builtin = BUILTIN_ROLE_ID_SET.has(r.id)
                  const activeN = userCountByRole.get(r.id) ?? 0
                  const totalN = memberCountByRole.get(r.id) ?? 0
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {r.description}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {r.permissionKeys.length}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        <span>{activeN} active</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {totalN} total
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={operationalRowActionTriggerClass}
                            aria-label={`Actions for role ${r.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-40">
                            <DropdownMenuItem
                              onClick={() => openInspectRole(r)}
                            >
                              View permissions
                            </DropdownMenuItem>
                            {canManage ? (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(r)}>
                                  Edit role
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={builtin}
                                  onClick={() => void deleteRole(r.id)}
                                >
                                  Delete role
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Sheet
        open={inspectOpen}
        onOpenChange={(open) => {
          setInspectOpen(open)
          if (!open) setInspectRole(null)
        }}
      >
        <SheetContent className="flex w-full max-w-lg flex-col gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle>
              Role permissions
              {inspectRole ? ` · ${inspectRole.name}` : ""}
            </SheetTitle>
            <SheetDescription>
              {inspectRole
                ? `${inspectRole.permissionKeys.length} keys assigned to this role.`
                : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="max-h-[min(65vh,640px)] space-y-4 overflow-y-auto px-4 py-4 text-xs">
            {[...inspectGrouped.entries()].map(([mod, defs]) => (
              <div key={mod}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {mod}
                </div>
                <ul className="space-y-2">
                  {defs.map((d) => (
                    <li key={d.key}>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {d.key}
                      </span>
                      <div className="text-foreground">{d.label}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {inspectUnknownKeys.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Other keys
                </div>
                <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                  {inspectUnknownKeys.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {canManage ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="flex w-full max-w-lg flex-col gap-0 overflow-y-auto sm:max-w-xl">
            <SheetHeader className="border-b border-border pb-4">
              <SheetTitle>{editing ? "Edit role" : "Create role"}</SheetTitle>
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
              <div className="max-h-[min(56vh,560px)] space-y-4 overflow-y-auto rounded-md border border-border p-3">
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
      ) : null}
    </SectionCard>
  )
}

function PermissionsCatalogPanel() {
  const catalogP = useAnyPermission([
    "users.view",
    "users.permissions.view",
    "users.roles.manage",
  ])
  const [defs, setDefs] = useState<PermissionDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (catalogP.loading) return
    if (!catalogP.allowed) {
      setLoading(false)
      setDefs([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    void fetch("/api/rbac/permissions", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Load failed")
        const data = (await res.json()) as { permissions: PermissionDefinition[] }
        setDefs(data.permissions)
      })
      .catch(() => setError("Could not load catalog"))
      .finally(() => setLoading(false))
  }, [catalogP.loading, catalogP.allowed])

  const grouped = useMemo(() => groupByModule(defs), [defs])

  if (catalogP.loading) {
    return (
      <SectionCard
        title="Permission catalog"
        description="Grouped by module — roles grant subsets of these keys."
      >
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          Loading catalog…
        </p>
      </SectionCard>
    )
  }

  if (!catalogP.allowed) {
    return (
      <SectionCard title="Permissions" description="Master catalog of keys.">
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          You need{" "}
          <code className="text-xs">
            users.view
          </code>
          ,{" "}
          <code className="text-xs">users.permissions.view</code>, or{" "}
          <code className="text-xs">users.roles.manage</code>{" "}
          to view the catalog.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Permission catalog"
      description="Grouped by module — roles grant subsets of these keys."
    >
      <div className="border-t border-border pt-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="max-h-[min(70vh,720px)] space-y-6 overflow-y-auto pr-1">
            {[...grouped.entries()].map(([mod, list]) => (
              <div key={mod}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {mod}
                </h3>
                <div className="overflow-x-auto rounded-md border border-border">
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
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
