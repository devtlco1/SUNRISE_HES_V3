import { readFile } from "fs/promises"
import path from "path"

import { buildDashboardSnapshot } from "@/lib/dashboard/summary"
import { normalizeAlarmRows } from "@/lib/alarms/normalize"
import { normalizeCommandJobRows } from "@/lib/commands/normalize"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import { NextResponse } from "next/server"

async function readCatalogArray(filename: string): Promise<unknown[]> {
  const filePath = path.join(process.cwd(), "data", filename)
  const text = await readFile(filePath, "utf-8")
  const parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) {
    throw new Error(`INVALID_DASHBOARD_${filename}`)
  }
  return parsed
}

function assertNormalized<T>(
  raw: unknown[],
  normalized: T[],
  label: string
): void {
  if (raw.length > 0 && normalized.length === 0) {
    throw new Error(`INVALID_DASHBOARD_${label}`)
  }
}

export async function GET() {
  try {
    const [metersRaw, alarmsRaw, commandsRaw] = await Promise.all([
      readCatalogArray("meters.json"),
      readCatalogArray("alarms.json"),
      readCatalogArray("commands.json"),
    ])

    const meters = normalizeMeterRows(metersRaw)
    const alarms = normalizeAlarmRows(alarmsRaw)
    const commandJobs = normalizeCommandJobRows(commandsRaw)

    assertNormalized(metersRaw, meters, "METERS")
    assertNormalized(alarmsRaw, alarms, "ALARMS")
    assertNormalized(commandsRaw, commandJobs, "COMMANDS")

    const snapshot = buildDashboardSnapshot(meters, alarms, commandJobs)

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "DASHBOARD_LOAD_FAILED" },
      { status: 500 }
    )
  }
}
