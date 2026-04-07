import { readObisCatalog, writeObisCatalog } from "@/lib/obis/catalog-store"
import { upsertCatalogImport } from "@/lib/obis/catalog-import-upsert"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const importArray =
    body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as { rows: unknown }).rows)
      ? (body as { rows: unknown[] }).rows
      : body

  const existing = await readObisCatalog()
  const { rows, summary } = upsertCatalogImport(existing, importArray)

  const applied = summary.inserted + summary.updated
  if (applied === 0) {
    return NextResponse.json(
      { ok: false, error: "NO_ROWS_APPLIED", summary },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  }

  try {
    await writeObisCatalog(rows)
  } catch {
    return NextResponse.json({ error: "OBIS_CATALOG_WRITE_FAILED" }, { status: 500 })
  }

  return NextResponse.json(
    { ok: true, summary, rowCount: rows.length },
    { headers: { "Cache-Control": "no-store" } }
  )
}
