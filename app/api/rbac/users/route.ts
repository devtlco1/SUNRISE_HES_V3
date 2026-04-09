import { requireApiPermission } from "@/lib/rbac/require-api-permission"
import { readRbacUsersUnsafe, writeRbacUsers } from "@/lib/rbac/json-store"
import { toPublicRbacUser, toPublicRbacUsers } from "@/lib/rbac/public-user"
import { ensureRbacSeed } from "@/lib/rbac/seed-defaults"
import type { RbacUser } from "@/types/rbac"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const gate = await requireApiPermission("users.view")
  if (!gate.ok) return gate.response
  await ensureRbacSeed()
  const users = await readRbacUsersUnsafe()
  return NextResponse.json(toPublicRbacUsers(users), {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("users.create")
  if (!gate.ok) return gate.response
  await ensureRbacSeed()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const username = typeof o.username === "string" ? o.username.trim() : ""
  const displayName = typeof o.displayName === "string" ? o.displayName.trim() : ""
  const email = typeof o.email === "string" ? o.email.trim() : ""
  const roleId = typeof o.roleId === "string" ? o.roleId.trim() : ""
  const invitePending = o.invitePending === true
  const active =
    typeof o.active === "boolean"
      ? o.active
      : invitePending
        ? false
        : true
  if (!username || !displayName || !roleId) {
    return NextResponse.json({ error: "INVALID_FIELDS" }, { status: 400 })
  }
  const users = await readRbacUsersUnsafe()
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return NextResponse.json({ error: "DUPLICATE_USERNAME" }, { status: 409 })
  }
  const now = new Date().toISOString()
  const row: RbacUser = {
    id: `usr-${crypto.randomUUID()}`,
    username,
    displayName,
    email,
    roleId,
    active,
    ...(invitePending
      ? { invitePending: true as const, invitedAt: now }
      : {}),
    team: typeof o.team === "string" ? o.team.trim() : undefined,
    phone: typeof o.phone === "string" ? o.phone.trim() : undefined,
    assignedScope:
      typeof o.assignedScope === "string" ? o.assignedScope.trim() : undefined,
    createdAt: now,
    updatedAt: now,
  }
  const w = await writeRbacUsers([...users, row])
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(toPublicRbacUser(row), { status: 201 })
}
