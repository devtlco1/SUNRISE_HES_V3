import { filterValidPermissionKeys } from "@/lib/rbac/permission-registry"
import { hasAnyPermission } from "@/lib/rbac/resolve"
import { requireApiPermission } from "@/lib/rbac/require-api-permission"
import { getRbacSession } from "@/lib/rbac/session-server"
import { readRbacRolesUnsafe, writeRbacRoles } from "@/lib/rbac/json-store"
import { ensureRbacSeed } from "@/lib/rbac/seed-defaults"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  await ensureRbacSeed()
  const session = await getRbacSession()
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  const set = new Set(session.permissions)
  if (!hasAnyPermission(set, ["users.view", "users.roles.manage"])) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }
  const roles = await readRbacRolesUnsafe()
  return NextResponse.json(roles, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("users.roles.manage")
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const name = typeof o.name === "string" ? o.name.trim() : ""
  const description = typeof o.description === "string" ? o.description.trim() : ""
  const permissionKeys = Array.isArray(o.permissionKeys)
    ? o.permissionKeys.filter((x): x is string => typeof x === "string")
    : []
  if (!name) {
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 })
  }
  const roles = await readRbacRolesUnsafe()
  if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "DUPLICATE_ROLE_NAME" }, { status: 409 })
  }
  const now = new Date().toISOString()
  const id = `role-${crypto.randomUUID()}`
  const row = {
    id,
    name,
    description,
    permissionKeys: filterValidPermissionKeys(permissionKeys),
    createdAt: now,
    updatedAt: now,
  }
  const w = await writeRbacRoles([...roles, row])
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(row, { status: 201 })
}
