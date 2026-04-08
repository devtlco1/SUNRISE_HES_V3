import { tariffProfilesTemplateCsv } from "@/lib/configuration/tariff-profiles-csv"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return new NextResponse(tariffProfilesTemplateCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="tariff-profiles-template.csv"',
    },
  })
}
