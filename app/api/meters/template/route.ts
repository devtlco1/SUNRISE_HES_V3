import { metersTemplateCsv } from "@/lib/meters/meters-csv"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const body = `\uFEFF${metersTemplateCsv()}`
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="meters-template.csv"',
    },
  })
}
