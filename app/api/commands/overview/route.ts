import { loadLegacyCommandJobs } from "@/lib/commands/legacy-jobs-load"
import { buildCommandsOverviewStats } from "@/lib/commands/overview-stats"
import {
  readCommandGroupsRaw,
  readCommandSchedulesRaw,
  readOperatorRunsRaw,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandGroups,
  normalizeCommandSchedules,
  normalizeOperatorRuns,
} from "@/lib/commands/operator-normalize"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const [graw, sraw, rraw, legacy] = await Promise.all([
    readCommandGroupsRaw(),
    readCommandSchedulesRaw(),
    readOperatorRunsRaw(),
    loadLegacyCommandJobs(),
  ])

  if (!graw.ok) {
    return NextResponse.json({ error: graw.error }, { status: 500 })
  }
  if (!sraw.ok) {
    return NextResponse.json({ error: sraw.error }, { status: 500 })
  }
  if (!rraw.ok) {
    return NextResponse.json({ error: rraw.error }, { status: 500 })
  }

  const groups = normalizeCommandGroups(graw.parsed)
  const schedules = normalizeCommandSchedules(sraw.parsed)
  const operatorRuns = normalizeOperatorRuns(rraw.parsed)
  const legacyJobs = legacy.ok ? legacy.rows : []

  const stats = buildCommandsOverviewStats({
    groupsCount: groups.length,
    schedulesCount: schedules.length,
    operatorRuns,
    legacyJobs,
  })

  return NextResponse.json(
    { stats, legacyCatalogLoaded: legacy.ok },
    { headers: { "Cache-Control": "no-store" } }
  )
}
