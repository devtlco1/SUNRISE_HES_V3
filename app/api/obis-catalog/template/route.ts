import { obisCatalogTemplateDownloadRows } from "@/lib/obis/catalog-import-upsert"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const body = `${JSON.stringify(obisCatalogTemplateDownloadRows(), null, 2)}\n`
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="obis-catalog-template.json"',
      "Cache-Control": "no-store",
    },
  })
}
