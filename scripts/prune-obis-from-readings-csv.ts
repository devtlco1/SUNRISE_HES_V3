/**
 * One-shot / repeatable: align `data/obis-catalog.json` enabled flags with a
 * readings export CSV (`Read status === ok` ⇒ enabled; all other rows in CSV
 * and every catalog row not in the ok set ⇒ disabled).
 *
 * Usage:
 *   npx tsx scripts/prune-obis-from-readings-csv.ts [path/to.csv]
 *
 * Default CSV: data/obis-read-results/readings_202402240051_20260411T144153.csv
 */

import { copyFile, mkdir, readFile } from "fs/promises"
import path from "path"

import {
  parseReadingsExportCsv,
  summarizeReadingsCsv,
  supportedObjectCodesOk,
} from "../lib/obis/readings-results-csv"
import { readObisCatalog, writeObisCatalog } from "../lib/obis/catalog-store"
import {
  readObisCodeGroupsRaw,
  writeObisCodeGroupsArray,
} from "../lib/commands/operator-file"
import { normalizeObisCodeGroups } from "../lib/commands/operator-normalize"
import type { ObisCatalogEntry } from "../lib/obis/types"
import type { CommandActionGroup } from "../types/command-operator"

const DEFAULT_CSV = path.join(
  process.cwd(),
  "data",
  "obis-read-results",
  "readings_202402240051_20260411T144153.csv"
)

const DISABLE_NOTE = "disabled: not Read status ok in readings export"

async function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV
  const csvText = await readFile(csvPath, "utf-8")
  const rows = parseReadingsExportCsv(csvText)
  const supported = supportedObjectCodesOk(rows)
  const summary = summarizeReadingsCsv(rows)

  const catalogPath = path.join(process.cwd(), "data", "obis-catalog.json")
  const backupDir = path.join(process.cwd(), "data", "backups")
  await mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupPath = path.join(
    backupDir,
    `obis-catalog-pre-readings-prune-${stamp}.json`
  )
  await copyFile(catalogPath, backupPath)
  console.log("Backup:", backupPath)

  const catalog = await readObisCatalog()
  let enabledCount = 0
  let disabledCount = 0
  const next: ObisCatalogEntry[] = catalog.map((r) => {
    const ok = supported.has(r.object_code)
    if (ok) {
      enabledCount++
      return {
        ...r,
        enabled: true,
        status: r.status === "catalog_only" ? "active" : r.status,
      }
    }
    disabledCount++
    const note = r.notes?.includes(DISABLE_NOTE)
      ? r.notes
      : r.notes
        ? `${r.notes} | ${DISABLE_NOTE}`
        : DISABLE_NOTE
    return {
      ...r,
      enabled: false,
      status: "catalog_only" as const,
      notes: note,
    }
  })

  await writeObisCatalog(next)

  const rawGroups = await readObisCodeGroupsRaw()
  if (rawGroups.ok) {
    const groups = normalizeObisCodeGroups(rawGroups.parsed)
    const pruned: CommandActionGroup[] = groups.map((g) => {
      if (g.actionMode !== "read_catalog") return g
      const filtered = g.objectCodes.filter((c) => supported.has(c))
      if (filtered.length === g.objectCodes.length) return g
      return {
        ...g,
        objectCodes: filtered,
        updatedAt: new Date().toISOString(),
      }
    })
    const w = await writeObisCodeGroupsArray(pruned)
    if (!w.ok) console.warn("command-obis-groups write:", w.error)
    else console.log("command-obis-groups.json reconciled (removed disabled codes).")
  }

  console.log("CSV:", csvPath)
  console.log("Distinct object codes in CSV:", summary.distinctObjectCodes)
  console.log("Supported (≥1 ok):", summary.supportedOk)
  console.log("CSV rows not ok (error/unsupported/not_attempted):", summary.unsupportedCount)
  console.log("Catalog rows enabled:", enabledCount)
  console.log("Catalog rows disabled:", disabledCount)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
