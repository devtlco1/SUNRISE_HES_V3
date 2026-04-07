import { readObisCatalog } from "@/lib/obis/catalog-store"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await readObisCatalog()
    const body = `${JSON.stringify(rows, null, 2)}\n`
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="obis-catalog.json"',
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "OBIS_CATALOG_EXPORT_FAILED" }, { status: 500 })
  }
}
