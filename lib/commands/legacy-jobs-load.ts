import { readFile } from "fs/promises"
import path from "path"

import { normalizeCommandJobRows } from "@/lib/commands/normalize"
import type { CommandJobRow } from "@/types/command"

export async function loadLegacyCommandJobs(): Promise<
  | { ok: true; rows: CommandJobRow[] }
  | { ok: false; error: string }
> {
  try {
    const filePath = path.join(process.cwd(), "data", "commands.json")
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "INVALID_COMMANDS_PAYLOAD" }
    }
    const rows = normalizeCommandJobRows(parsed)
    if (rows.length === 0 && parsed.length > 0) {
      return { ok: false, error: "INVALID_COMMANDS_ROWS" }
    }
    return { ok: true, rows }
  } catch {
    return { ok: false, error: "COMMANDS_LOAD_FAILED" }
  }
}
