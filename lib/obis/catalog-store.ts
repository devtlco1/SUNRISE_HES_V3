/**
 * Server-only persistence for OBIS catalog (`data/obis-catalog.json`).
 * Bootstraps from `OBIS_CATALOG_SEED` when the file is missing.
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import { OBIS_CATALOG_SEED } from "@/lib/obis/catalog-seed"
import { normalizeObisCatalogRows } from "@/lib/obis/normalize-catalog"
import type { ObisCatalogEntry } from "@/lib/obis/types"

const FILE = "obis-catalog.json"

function catalogPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

export async function readObisCatalog(): Promise<ObisCatalogEntry[]> {
  const p = catalogPath()
  let raw: string
  try {
    raw = await readFile(p, "utf-8")
  } catch {
    const seed = normalizeObisCatalogRows(OBIS_CATALOG_SEED)
    await writeObisCatalog(seed)
    return seed
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return normalizeObisCatalogRows(OBIS_CATALOG_SEED)
  }
  const rows = normalizeObisCatalogRows(parsed)
  if (rows.length === 0 && Array.isArray(parsed) && parsed.length > 0) {
    return normalizeObisCatalogRows(OBIS_CATALOG_SEED)
  }
  if (rows.length === 0) {
    const seed = normalizeObisCatalogRows(OBIS_CATALOG_SEED)
    await writeObisCatalog(seed)
    return seed
  }
  return rows
}

export async function writeObisCatalog(rows: ObisCatalogEntry[]): Promise<void> {
  const p = catalogPath()
  const dir = path.dirname(p)
  await mkdir(dir, { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  const json = `${JSON.stringify(rows, null, 2)}\n`
  await writeFile(tmp, json, "utf-8")
  await rename(tmp, p)
}
