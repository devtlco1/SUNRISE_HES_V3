import { getRbacSession } from "@/lib/rbac/session-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getRbacSession()
  if (!session) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 401 })
  }
  return NextResponse.json(
    {
      user: session.user,
      role: session.role,
      permissions: session.permissions,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
