import { meterProfilesToCsv } from "@/lib/configuration/meter-profiles-csv"
import { readMeterProfilesRaw } from "@/lib/configuration/meter-profiles-file"
import { normalizeMeterProfileRows } from "@/lib/configuration/meter-profiles-normalize"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const raw = await readMeterProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeMeterProfileRows(raw.parsed)
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(meterProfilesToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="meter-profiles-export-${stamp}.csv"`,
    },
  })
}
