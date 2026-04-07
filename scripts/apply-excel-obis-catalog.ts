/**
 * Apply meter OBIS Excel workbook to persisted `data/obis-catalog.json`.
 * Usage: npx tsx scripts/apply-excel-obis-catalog.ts [path-to.xlsx]
 * Default: data/obis-catalog-sources/New Microsoft Excel Worksheet.xlsx
 */

import { readFile } from "fs/promises"
import path from "path"

import { readObisCatalog, writeObisCatalog } from "../lib/obis/catalog-store"
import { mergeExcelWorkbookBufferIntoCatalog } from "../lib/obis/excel-catalog-merge"
import { normalizeObisCatalogRows } from "../lib/obis/normalize-catalog"

async function main() {
  const cwd = process.cwd()
  const defaultPath = path.join(
    cwd,
    "data",
    "obis-catalog-sources",
    "New Microsoft Excel Worksheet.xlsx"
  )
  const xlsxPath = path.resolve(cwd, process.argv[2] ?? defaultPath)
  const buf = await readFile(xlsxPath)
  const existing = await readObisCatalog()
  const { rows, summary } = mergeExcelWorkbookBufferIntoCatalog(existing, buf)
  const normalized = normalizeObisCatalogRows(rows)
  await writeObisCatalog(normalized)
  console.log(JSON.stringify({ xlsxPath, summary, rowCount: normalized.length }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
