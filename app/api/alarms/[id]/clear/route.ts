import { markOperationalAlarmCleared } from "@/lib/alarms/operational-mutations"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  if (!id) {
    return NextResponse.json({ error: "MISSING_ID" }, { status: 400 })
  }
  const r = await markOperationalAlarmCleared(decodeURIComponent(id))
  if (!r.ok) {
    const status = r.error === "NOT_FOUND" ? 404 : 500
    return NextResponse.json({ error: r.error }, { status })
  }
  return NextResponse.json({ ok: true })
}
