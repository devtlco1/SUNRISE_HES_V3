import { readObisCatalog, writeObisCatalog } from "@/lib/obis/catalog-store"
import { mergeCatalogImportExistingWins } from "@/lib/obis/merge-catalog-import"
import { normalizeObisCatalogRows } from "@/lib/obis/normalize-catalog"
import { loadSt34Hw08CatalogEntriesFromDisk } from "@/lib/obis/st34-hw08-yaml-import"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Merge ST34-HW08 manual YAML (`data/obis-catalogs/st34-hw08-user-manual-3ph.yaml`)
 * into persisted `data/obis-catalog.json`. Existing OBIS rows win on conflict (idempotent).
 */
export async function POST() {
  try {
    const existing = await readObisCatalog()
    const fromYaml = await loadSt34Hw08CatalogEntriesFromDisk()
    const imported = normalizeObisCatalogRows(fromYaml)
    if (imported.length === 0) {
      return NextResponse.json(
        { error: "ST34_YAML_EMPTY_OR_INVALID", message: "No catalog rows parsed from YAML." },
        { status: 400 },
      )
    }
    const { merged, addedCount, skippedCount, addedObis, skippedObis } =
      mergeCatalogImportExistingWins(existing, imported)
    const normalized = normalizeObisCatalogRows(merged)
    if (normalized.length === 0) {
      return NextResponse.json({ error: "MERGE_RESULT_EMPTY" }, { status: 500 })
    }
    await writeObisCatalog(normalized)
    return NextResponse.json(
      {
        ok: true,
        addedCount,
        skippedCount,
        total: normalized.length,
        addedObis: addedObis.slice(0, 200),
        skippedObis: skippedObis.slice(0, 200),
        truncated:
          addedObis.length > 200 || skippedObis.length > 200
            ? { addedObis: addedObis.length, skippedObis: skippedObis.length }
            : undefined,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: "ST34_IMPORT_FAILED", message },
      { status: 500 },
    )
  }
}
