import { readObisCatalog, writeObisCatalog } from "@/lib/obis/catalog-store"
import { mergeExcelWorkbookBufferIntoCatalog } from "@/lib/obis/excel-catalog-merge"
import { normalizeObisCatalogRows } from "@/lib/obis/normalize-catalog"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let buffer: Buffer
  const ct = req.headers.get("content-type") ?? ""
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "EXPECTED_FILE_FIELD" }, { status: 400 })
    }
    buffer = Buffer.from(await file.arrayBuffer())
  } else {
    try {
      buffer = Buffer.from(await req.arrayBuffer())
    } catch {
      return NextResponse.json({ error: "EMPTY_BODY" }, { status: 400 })
    }
  }

  if (buffer.length < 64) {
    return NextResponse.json({ error: "FILE_TOO_SMALL" }, { status: 400 })
  }

  const existing = await readObisCatalog()
  let merged
  try {
    merged = mergeExcelWorkbookBufferIntoCatalog(existing, buffer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "EXCEL_PARSE_FAILED"
    return NextResponse.json({ error: "EXCEL_PARSE_FAILED", message: msg }, { status: 400 })
  }

  const normalized = normalizeObisCatalogRows(merged.rows)
  if (normalized.length === 0) {
    return NextResponse.json(
      { ok: false, error: "NO_VALID_ROWS_AFTER_MERGE", summary: merged.summary },
      { status: 400 }
    )
  }

  try {
    await writeObisCatalog(normalized)
  } catch {
    return NextResponse.json({ error: "OBIS_CATALOG_WRITE_FAILED" }, { status: 500 })
  }

  return NextResponse.json(
    {
      ok: true,
      summary: merged.summary,
      rowCount: normalized.length,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
