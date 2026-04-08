import { meterProfilesTemplateCsv } from "@/lib/configuration/meter-profiles-csv"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return new NextResponse(meterProfilesTemplateCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="meter-profiles-template.csv"',
    },
  })
}
