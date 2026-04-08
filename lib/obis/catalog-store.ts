/**
 * Server-only persistence for OBIS catalog (`data/obis-catalog.json`).
 * Canonical rows are vendor PRM join data (regenerate via `npm run obis:catalog:generate`).
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

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
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return []
  }
  return normalizeObisCatalogRows(parsed)
}

export async function writeObisCatalog(rows: ObisCatalogEntry[]): Promise<void> {
  const p = catalogPath()
  const dir = path.dirname(p)
  await mkdir(dir, { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  const normalized = normalizeObisCatalogRows(rows)
  const json = `${JSON.stringify(normalized, null, 2)}\n`
  await writeFile(tmp, json, "utf-8")
  await rename(tmp, p)
}
