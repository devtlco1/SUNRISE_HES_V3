import { requireApiPermission } from "@/lib/rbac/require-api-permission"
import { readRbacUsersUnsafe, writeRbacUsers } from "@/lib/rbac/json-store"
import { toPublicRbacUser } from "@/lib/rbac/public-user"
import type { RbacUser } from "@/types/rbac"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("users.view")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const users = await readRbacUsersUnsafe()
  const row = users.find((u) => u.id === id)
  if (!row) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  return NextResponse.json(toPublicRbacUser(row))
}

export async function PUT(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("users.edit")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const users = await readRbacUsersUnsafe()
  const idx = users.findIndex((u) => u.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const prev = users[idx]!
  const username =
    typeof o.username === "string" && o.username.trim()
      ? o.username.trim()
      : prev.username
  const displayName =
    typeof o.displayName === "string" && o.displayName.trim()
      ? o.displayName.trim()
      : prev.displayName
  const email =
    typeof o.email === "string" ? o.email.trim() : prev.email
  const roleId =
    typeof o.roleId === "string" && o.roleId.trim()
      ? o.roleId.trim()
      : prev.roleId
  const active =
    typeof o.active === "boolean" ? o.active : prev.active
  let nextInvitePending: boolean | undefined
  if (typeof o.invitePending === "boolean") {
    nextInvitePending = o.invitePending ? true : undefined
  } else {
    nextInvitePending = prev.invitePending
  }
  const now = new Date().toISOString()
  let nextInvitedAt = prev.invitedAt
  if (nextInvitePending) {
    if (!nextInvitedAt) nextInvitedAt = now
  } else {
    nextInvitedAt = undefined
  }
  if (
    users.some(
      (u, i) =>
        i !== idx && u.username.toLowerCase() === username.toLowerCase()
    )
  ) {
    return NextResponse.json({ error: "DUPLICATE_USERNAME" }, { status: 409 })
  }
  const next: RbacUser = {
    ...prev,
    username,
    displayName,
    email,
    roleId,
    active,
    invitePending: nextInvitePending,
    invitedAt: nextInvitedAt,
    team:
      typeof o.team === "string" ? o.team.trim() || undefined : prev.team,
    phone:
      typeof o.phone === "string" ? o.phone.trim() || undefined : prev.phone,
    assignedScope:
      typeof o.assignedScope === "string"
        ? o.assignedScope.trim() || undefined
        : prev.assignedScope,
    updatedAt: now,
  }
  const list = [...users]
  list[idx] = next
  const w = await writeRbacUsers(list)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(toPublicRbacUser(next))
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("users.delete")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const users = await readRbacUsersUnsafe()
  const idx = users.findIndex((u) => u.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const now = new Date().toISOString()
  const list = [...users]
  list[idx] = {
    ...list[idx]!,
    active: false,
    invitePending: undefined,
    invitedAt: undefined,
    updatedAt: now,
  }
  const w = await writeRbacUsers(list)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
