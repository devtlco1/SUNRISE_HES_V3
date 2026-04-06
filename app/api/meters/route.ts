import { readFile } from "fs/promises"
import path from "path"

import { normalizeMeterRows } from "@/lib/meters/normalize"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "meters.json")
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "INVALID_METERS_PAYLOAD" },
        { status: 500 }
      )
    }

    const rows = normalizeMeterRows(parsed)
    if (rows.length === 0 && parsed.length > 0) {
      return NextResponse.json(
        { error: "INVALID_METERS_ROWS" },
        { status: 500 }
      )
    }

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "METERS_LOAD_FAILED" }, { status: 500 })
  }
}
