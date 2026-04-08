import { getConnectivityMeterDetailPayload } from "@/lib/connectivity/meter-detail-data"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ meterId: string }> }
) {
  const { meterId } = await ctx.params
  const data = await getConnectivityMeterDetailPayload(meterId)
  if (!data) {
    return NextResponse.json({ error: "METER_NOT_FOUND" }, { status: 404 })
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  })
}
