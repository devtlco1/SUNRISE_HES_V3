import { readFile } from "fs/promises"
import path from "path"

import { normalizeCommandJobRows } from "@/lib/commands/normalize"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "commands.json")
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "INVALID_COMMANDS_PAYLOAD" },
        { status: 500 }
      )
    }

    const rows = normalizeCommandJobRows(parsed)
    if (rows.length === 0 && parsed.length > 0) {
      return NextResponse.json(
        { error: "INVALID_COMMANDS_ROWS" },
        { status: 500 }
      )
    }

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "COMMANDS_LOAD_FAILED" },
      { status: 500 }
    )
  }
}
