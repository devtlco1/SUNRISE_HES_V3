import { readFile } from "fs/promises"
import path from "path"

import { normalizeAlarmRows } from "@/lib/alarms/normalize"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "alarms.json")
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "INVALID_ALARMS_PAYLOAD" },
        { status: 500 }
      )
    }

    const rows = normalizeAlarmRows(parsed)
    if (rows.length === 0 && parsed.length > 0) {
      return NextResponse.json(
        { error: "INVALID_ALARMS_ROWS" },
        { status: 500 }
      )
    }

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "ALARMS_LOAD_FAILED" }, { status: 500 })
  }
}
