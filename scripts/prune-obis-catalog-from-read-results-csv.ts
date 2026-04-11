/**
 * Prune persisted OBIS catalog + command OBIS groups from a "read results" CSV export.
 *
 * Usage (from repo root):
 *   npx tsx scripts/prune-obis-catalog-from-read-results-csv.ts <path-to.csv> [--dry-run]
 *
 * Backup copies are written to `data/backups/` before mutating JSON.
 *
 * @see lib/readings/csv-export.ts for expected columns.
 */

import { copyFile, mkdir, readFile, writeFile } from "fs/promises"
import path from "path"

import { applyCatalogPruneFromReadResultsRows } from "@/lib/obis/prune-catalog-from-read-results"
import { parseReadResultsCsv } from "@/lib/obis/read-results-csv"
import { readObisCatalog, writeObisCatalog } from "@/lib/obis/catalog-store"
import {
  commandObisCodeGroupsJsonPath,
  commandSchedulesJsonPath,
  readCommandSchedulesRaw,
  readObisCodeGroupsRaw,
  writeCommandSchedulesArray,
  writeObisCodeGroupsArray,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandSchedules,
  normalizeObisCodeGroups,
} from "@/lib/commands/operator-normalize"

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes("--dry-run")
  const csvPath = argv.find((a) => !a.startsWith("--"))
  if (!csvPath) {
    console.error(
      "Usage: npx tsx scripts/prune-obis-catalog-from-read-results-csv.ts <read-results.csv> [--dry-run]"
    )
    process.exit(1)
  }

  const absCsv = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath)
  const csvText = await readFile(absCsv, "utf-8")
  const parsed = parseReadResultsCsv(csvText)
  if (!parsed.ok) {
    console.error(parsed.error)
    process.exit(1)
  }

  const catalog = await readObisCatalog()
  const rawGroups = await readObisCodeGroupsRaw()
  const rawSched = await readCommandSchedulesRaw()
  if (!rawGroups.ok || !rawSched.ok) {
    console.error("Failed to load command-obis-groups or command-schedules JSON.")
    process.exit(1)
  }
  const actionGroups = normalizeObisCodeGroups(rawGroups.parsed)
  const schedules = normalizeCommandSchedules(rawSched.parsed)

  const result = applyCatalogPruneFromReadResultsRows(
    catalog,
    actionGroups,
    schedules,
    parsed.rows
  )

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = path.join(process.cwd(), "data", "backups")
  await mkdir(backupDir, { recursive: true })
  const catPath = path.join(process.cwd(), "data", "obis-catalog.json")
  const grpPath = commandObisCodeGroupsJsonPath()
  const schPath = commandSchedulesJsonPath()

  console.log(JSON.stringify({ sourceCsv: absCsv, dryRun: dry, stats: result.stats }, null, 2))

  if (dry) {
    console.log("Dry run — no files written.")
    return
  }

  await copyFile(catPath, path.join(backupDir, `obis-catalog.pre-prune.${stamp}.json`))
  await copyFile(grpPath, path.join(backupDir, `command-obis-groups.pre-prune.${stamp}.json`))
  await copyFile(schPath, path.join(backupDir, `command-schedules.pre-prune.${stamp}.json`))

  await writeObisCatalog(result.catalog)
  const wg = await writeObisCodeGroupsArray(result.actionGroups as unknown[])
  const ws = await writeCommandSchedulesArray(result.schedules as unknown[])
  if (!wg.ok || !ws.ok) {
    console.error("Write failed", wg, ws)
    process.exit(1)
  }

  const reportPath = path.join(backupDir, `obis-prune-report.${stamp}.json`)
  await writeFile(
    reportPath,
    `${JSON.stringify({ sourceCsv: absCsv, stats: result.stats }, null, 2)}\n`,
    "utf-8"
  )
  console.log(`Wrote report: ${reportPath}`)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
