/**
 * Hard verification: persisted catalog is PRM-shaped and legacy fields are absent.
 *
 * Usage: npx tsx scripts/verify-obis-catalog-prm.ts [path/to/obis-catalog.json]
 * Default: data/obis-catalog.json
 */

import { readFile } from "fs/promises"
import path from "path"

import { inferCatalogRowKind } from "../lib/obis/catalog-row-kind"
import type { ObisCatalogEntry } from "../lib/obis/types"

const LEGACY_KEYS = ["family_tab", "section_group", "pack_key"] as const

async function main() {
  const cwd = process.cwd()
  const rel = process.argv[2] ?? path.join("data", "obis-catalog.json")
  const filePath = path.isAbsolute(rel) ? rel : path.join(cwd, rel)

  const raw = await readFile(filePath, "utf-8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    console.error("Expected top-level JSON array")
    process.exit(1)
  }

  let legacyHits = 0
  const byClass = new Map<string, number>()
  let billingProfileObis = 0
  let object99 = 0
  const requiredSamples = new Set([
    "0.0.99.1.0.255.2",
    "0.0.99.1.0.255.3",
    "0.0.99.1.0.255.4",
  ])
  const foundSamples = new Set<string>()
  let missingVendorFields = 0

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>

    for (const k of LEGACY_KEYS) {
      if (k in row && row[k] !== undefined && row[k] !== null) {
        legacyHits += 1
        console.error(`Legacy field present: ${k} on row`, row.obis ?? row.object_code)
      }
    }

    const cn = typeof row.class_name === "string" ? row.class_name : ""
    if (!cn) missingVendorFields += 1
    else byClass.set(cn, (byClass.get(cn) ?? 0) + 1)

    const obis = typeof row.obis === "string" ? row.obis : ""
    const oc = typeof row.object_code === "string" ? row.object_code : ""
    if (obis.includes("0.0.99.") || oc.includes("0.0.99.")) object99 += 1
    if (requiredSamples.has(oc)) foundSamples.add(oc)

    try {
      const entry = row as unknown as ObisCatalogEntry
      if (inferCatalogRowKind(entry) === "capture_object") billingProfileObis += 1
    } catch {
      /* skip malformed */
    }
  }

  const sortedClasses = [...byClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  console.log("=== OBIS catalog PRM verification ===")
  console.log("File:", filePath)
  console.log("Total rows:", parsed.length)
  console.log("Rows missing class_name:", missingVendorFields)
  console.log("Legacy field violations:", legacyHits)
  console.log("Rows with 0.0.99.* (object_code or obis):", object99)
  console.log("Rows inferred as billing/profile capture (heuristic):", billingProfileObis)
  console.log(
    "Required sample object_codes present:",
    [...requiredSamples].every((s) => foundSamples.has(s)),
    [...foundSamples].sort().join(", ") || "(none)"
  )
  console.log("\nCount by ClassName (PRM):")
  for (const [c, n] of sortedClasses) {
    console.log(`  ${n}\t${c}`)
  }

  if (legacyHits > 0 || missingVendorFields > 0) {
    console.error("\nFAILED: legacy fields or missing PRM class_name")
    process.exit(1)
  }
  if (parsed.length === 0) {
    console.error("\nFAILED: empty catalog")
    process.exit(1)
  }
  if (object99 < 1) {
    console.error("\nFAILED: expected at least one 0.0.99.* billing/profile style row")
    process.exit(1)
  }
  for (const s of requiredSamples) {
    if (!foundSamples.has(s)) {
      console.error(`\nFAILED: missing expected object_code ${s}`)
      process.exit(1)
    }
  }

  console.log("\nOK")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
