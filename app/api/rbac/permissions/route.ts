import { hasAnyPermission } from "@/lib/rbac/resolve"
import { getRbacSession } from "@/lib/rbac/session-server"
import { PERMISSION_REGISTRY } from "@/lib/rbac/permission-registry"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getRbacSession()
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  const set = new Set(session.permissions)
  if (
    !hasAnyPermission(set, ["users.permissions.view", "users.roles.manage"])
  ) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }
  return NextResponse.json(
    { permissions: PERMISSION_REGISTRY },
    { headers: { "Cache-Control": "no-store" } }
  )
}
