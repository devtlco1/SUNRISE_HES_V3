import { catalogRowsToCsv } from "@/lib/obis/catalog-csv"
import { readObisCatalog } from "@/lib/obis/catalog-store"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await readObisCatalog()
    const body = catalogRowsToCsv(rows, true)
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="obis-catalog-export.csv"',
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "OBIS_CATALOG_EXPORT_FAILED" }, { status: 500 })
  }
}
