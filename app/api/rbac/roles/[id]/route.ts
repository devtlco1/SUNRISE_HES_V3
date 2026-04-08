import { filterValidPermissionKeys } from "@/lib/rbac/permission-registry"
import { requireApiPermission } from "@/lib/rbac/require-api-permission"
import { readRbacRolesUnsafe, readRbacUsersUnsafe, writeRbacRoles } from "@/lib/rbac/json-store"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("users.roles.manage")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const roles = await readRbacRolesUnsafe()
  const row = roles.find((r) => r.id === id)
  if (!row) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  return NextResponse.json(row)
}

export async function PUT(req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("users.roles.manage")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const roles = await readRbacRolesUnsafe()
  const idx = roles.findIndex((r) => r.id === id)
  if (idx < 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const prev = roles[idx]!
  const name =
    typeof o.name === "string" && o.name.trim() ? o.name.trim() : prev.name
  const description =
    typeof o.description === "string" ? o.description.trim() : prev.description
  const permissionKeys = Array.isArray(o.permissionKeys)
    ? filterValidPermissionKeys(
        o.permissionKeys.filter((x): x is string => typeof x === "string")
      )
    : prev.permissionKeys
  if (roles.some((r, i) => i !== idx && r.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "DUPLICATE_ROLE_NAME" }, { status: 409 })
  }
  const now = new Date().toISOString()
  const next = [...roles]
  next[idx] = {
    ...prev,
    name,
    description,
    permissionKeys,
    updatedAt: now,
  }
  const w = await writeRbacRoles(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(next[idx])
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireApiPermission("users.roles.manage")
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const users = await readRbacUsersUnsafe()
  if (users.some((u) => u.roleId === id)) {
    return NextResponse.json(
      { error: "ROLE_IN_USE" },
      { status: 409 }
    )
  }
  const roles = await readRbacRolesUnsafe()
  const next = roles.filter((r) => r.id !== id)
  if (next.length === roles.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  const w = await writeRbacRoles(next)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
