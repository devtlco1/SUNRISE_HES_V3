import { readFile } from "fs/promises"
import path from "path"

import { normalizeConnectivityRows } from "@/lib/connectivity/normalize"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "connectivity.json")
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "INVALID_CONNECTIVITY_PAYLOAD" },
        { status: 500 }
      )
    }

    const rows = normalizeConnectivityRows(parsed)
    // Empty array [] → 200 with []. 500 only when input had items but none normalized.
    if (rows.length === 0 && parsed.length > 0) {
      return NextResponse.json(
        { error: "INVALID_CONNECTIVITY_ROWS" },
        { status: 500 }
      )
    }

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "CONNECTIVITY_LOAD_FAILED" },
      { status: 500 }
    )
  }
}
