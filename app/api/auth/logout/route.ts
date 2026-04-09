import { AUTH_SESSION_COOKIE } from "@/lib/auth/constants"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  const jar = await cookies()
  jar.delete(AUTH_SESSION_COOKIE)
  return NextResponse.json({ ok: true })
}
