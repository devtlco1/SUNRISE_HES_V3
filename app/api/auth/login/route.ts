import { AUTH_SESSION_COOKIE } from "@/lib/auth/constants"
import { verifyPassword } from "@/lib/auth/password"
import { signSessionToken } from "@/lib/auth/session-token"
import { readRbacUsersUnsafe } from "@/lib/rbac/json-store"
import { ensureRbacSeed } from "@/lib/rbac/seed-defaults"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  await ensureRbacSeed()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const login =
    typeof o.login === "string"
      ? o.login.trim()
      : typeof o.username === "string"
        ? o.username.trim()
        : ""
  const password = typeof o.password === "string" ? o.password : ""
  if (!login || !password) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 })
  }

  const users = await readRbacUsersUnsafe()
  const user = users.find(
    (u) =>
      u.username.toLowerCase() === login.toLowerCase() ||
      u.email.toLowerCase() === login.toLowerCase()
  )
  if (!user?.active || !user.passwordHash) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 })
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 })
  }

  const token = signSessionToken(user.id)
  const jar = await cookies()
  jar.set(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  return NextResponse.json({ ok: true })
}
