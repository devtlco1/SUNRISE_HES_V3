import { loadConnectivityAggregation } from "@/lib/connectivity/load-aggregate"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const agg = await loadConnectivityAggregation()
  if (!agg.ok) {
    return NextResponse.json({ error: agg.error }, { status: 500 })
  }

  return NextResponse.json(
    {
      summary: agg.summary,
      rows: agg.rows,
      fetchedAt: new Date().toISOString(),
      /** Full history lives on `/connectivity/events` and `/api/connectivity-events`. */
      recentEvents: [],
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  )
}
