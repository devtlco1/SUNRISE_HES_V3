import { readObisCatalog, writeObisCatalog } from "@/lib/obis/catalog-store"
import { normalizeObisCatalogRows } from "@/lib/obis/normalize-catalog"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rows = await readObisCatalog()
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "OBIS_CATALOG_LOAD_FAILED" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "EXPECTED_ARRAY" }, { status: 400 })
  }
  const rows = normalizeObisCatalogRows(body)
  if (rows.length === 0) {
    return NextResponse.json({ error: "NO_VALID_ROWS" }, { status: 400 })
  }
  try {
    await writeObisCatalog(rows)
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "OBIS_CATALOG_WRITE_FAILED" }, { status: 500 })
  }
}
