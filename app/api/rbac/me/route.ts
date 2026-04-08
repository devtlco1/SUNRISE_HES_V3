import { hasPermission } from "@/lib/rbac/resolve"
import { getRbacSession } from "@/lib/rbac/session-server"
import { readRbacUsersUnsafe } from "@/lib/rbac/json-store"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getRbacSession()
  if (!session) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 401 })
  }
  const set = new Set(session.permissions)
  let switchableUsers: { id: string; displayName: string; username: string }[] | undefined
  if (hasPermission(set, "users.session.switch")) {
    const all = await readRbacUsersUnsafe()
    switchableUsers = all
      .filter((u) => u.active)
      .map((u) => ({
        id: u.id,
        displayName: u.displayName,
        username: u.username,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }
  return NextResponse.json(
    {
      user: session.user,
      role: session.role,
      permissions: session.permissions,
      switchableUsers,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
