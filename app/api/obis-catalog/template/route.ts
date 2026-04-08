import { obisCatalogCsvTemplate } from "@/lib/obis/catalog-csv"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const body = obisCatalogCsvTemplate()
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="obis-catalog-template.csv"',
      "Cache-Control": "no-store",
    },
  })
}
