import { requireApiPermission } from "@/lib/rbac/require-api-permission"
import { getRbacSession, OPERATOR_USER_COOKIE } from "@/lib/rbac/session-server"
import { readRbacUsersUnsafe } from "@/lib/rbac/json-store"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const session = await getRbacSession()
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const userId =
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).userId === "string"
      ? (body as Record<string, string>).userId.trim()
      : ""
  if (!userId) {
    return NextResponse.json({ error: "MISSING_USER_ID" }, { status: 400 })
  }
  if (userId !== session.user.id) {
    const gate = await requireApiPermission("users.session.switch")
    if (!gate.ok) return gate.response
  }
  const users = await readRbacUsersUnsafe()
  const target = users.find((u) => u.id === userId && u.active)
  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 })
  }
  const res = NextResponse.json({ ok: true, userId: target.id })
  res.cookies.set(OPERATOR_USER_COOKIE, target.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
  })
  return res
}
