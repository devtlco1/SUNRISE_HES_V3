import { AUTH_SESSION_COOKIE } from "@/lib/auth/constants"
import { resolveAuthCookieSecure } from "@/lib/auth/cookie-secure"
import { authSessionCookieBase } from "@/lib/auth/session-cookie-options"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const jar = await cookies()
  const secure = resolveAuthCookieSecure(req)
  jar.set(AUTH_SESSION_COOKIE, "", {
    ...authSessionCookieBase(secure),
    maxAge: 0,
  })
  if (secure) {
    jar.set(AUTH_SESSION_COOKIE, "", {
      ...authSessionCookieBase(false),
      maxAge: 0,
    })
  } else {
    jar.set(AUTH_SESSION_COOKIE, "", {
      ...authSessionCookieBase(true),
      maxAge: 0,
    })
  }
  return NextResponse.json({ ok: true })
}
