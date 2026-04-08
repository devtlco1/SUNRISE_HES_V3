import { allocateConfigId } from "@/lib/configuration/config-id"
import {
  feedersTemplateCsv,
  feedersToCsv,
  transformersTemplateCsv,
  transformersToCsv,
  zonesTemplateCsv,
  zonesToCsv,
} from "@/lib/configuration/grid-topology-csv"
import {
  emptyGridTopologyDoc,
  normalizeGridTopologyDoc,
  readGridTopologyRaw,
  validateGridTopologyDoc,
  writeGridTopologyDoc,
} from "@/lib/configuration/grid-topology-file"
import {
  parseCsvKeyed,
  rowToFeederFields,
  rowToTransformerFields,
  rowToZoneFields,
} from "@/lib/configuration/parse-csv"
import type {
  FeederRow,
  GridTopologyDoc,
  TransformerRow,
  ZoneRow,
} from "@/types/configuration"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Kind = "feeders" | "transformers" | "zones"

function docOrEmpty(): Promise<GridTopologyDoc> {
  return readGridTopologyRaw().then((r) =>
    r.ok ? r.doc : emptyGridTopologyDoc()
  )
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get("kind") as Kind | null
  const template = searchParams.get("template") === "1"
  if (kind !== "feeders" && kind !== "transformers" && kind !== "zones") {
    return NextResponse.json({ error: "KIND_REQUIRED" }, { status: 400 })
  }
  if (template) {
    const body =
      kind === "feeders"
        ? feedersTemplateCsv()
        : kind === "transformers"
          ? transformersTemplateCsv()
          : zonesTemplateCsv()
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="grid-${kind}-template.csv"`,
      },
    })
  }
  const doc = await docOrEmpty()
  const stamp = new Date().toISOString().slice(0, 10)
  const body =
    kind === "feeders"
      ? feedersToCsv(doc.feeders)
      : kind === "transformers"
        ? transformersToCsv(doc.transformers)
        : zonesToCsv(doc.zones)
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="grid-${kind}-export-${stamp}.csv"`,
    },
  })
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get("kind") as Kind | null
  if (kind !== "feeders" && kind !== "transformers" && kind !== "zones") {
    return NextResponse.json({ error: "KIND_REQUIRED" }, { status: 400 })
  }
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 })
  }
  const file = form.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 })
  }
  const text = await (file as File).text()
  const { rows: keyed, errors: parseErrors } = parseCsvKeyed(text)
  if (keyed.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_DATA_ROWS", parseErrors }, { status: 400 })
  }

  let doc = await docOrEmpty()
  const rowErrors: string[] = [...parseErrors]
  let inserted = 0
  let updated = 0

  if (kind === "feeders") {
    let feeders = [...doc.feeders]
    for (let i = 0; i < keyed.length; i++) {
      const f = rowToFeederFields(keyed[i]!)
      const code = String(f.code ?? "").trim()
      const name = String(f.name ?? "").trim()
      if (!code || !name) {
        rowErrors.push(`Row ${i + 2}: code and name required.`)
        continue
      }
      const used = new Set(feeders.map((x) => x.id))
      const idIn = String(f.id ?? "").trim()
      const idx = idIn ? feeders.findIndex((x) => x.id === idIn) : -1
      if (idx >= 0) {
        feeders[idx] = {
          id: idIn,
          code,
          name,
          notes: String(f.notes ?? "").trim(),
        }
        updated++
        continue
      }
      let id = idIn || allocateConfigId("gf", code, used)
      if (feeders.some((x) => x.id === id)) {
        rowErrors.push(`Row ${i + 2}: id exists.`)
        continue
      }
      feeders.push({ id, code, name, notes: String(f.notes ?? "").trim() })
      inserted++
    }
    doc = { ...doc, feeders }
  } else if (kind === "transformers") {
    let transformers = [...doc.transformers]
    const feederIds = new Set(doc.feeders.map((x) => x.id))
    for (let i = 0; i < keyed.length; i++) {
      const f = rowToTransformerFields(keyed[i]!)
      const code = String(f.code ?? "").trim()
      const name = String(f.name ?? "").trim()
      const feederId = String(f.feederId ?? "").trim()
      if (!code || !name || !feederId) {
        rowErrors.push(`Row ${i + 2}: code, name, feeder ID required.`)
        continue
      }
      if (!feederIds.has(feederId)) {
        rowErrors.push(`Row ${i + 2}: unknown feeder ${feederId}.`)
        continue
      }
      const used = new Set(transformers.map((x) => x.id))
      const idIn = String(f.id ?? "").trim()
      const idx = idIn ? transformers.findIndex((x) => x.id === idIn) : -1
      if (idx >= 0) {
        transformers[idx] = {
          id: idIn,
          code,
          name,
          feederId,
          notes: String(f.notes ?? "").trim(),
        }
        updated++
        continue
      }
      let id = idIn || allocateConfigId("gt", code, used)
      if (transformers.some((x) => x.id === id)) {
        rowErrors.push(`Row ${i + 2}: id exists.`)
        continue
      }
      transformers.push({ id, code, name, feederId, notes: String(f.notes ?? "").trim() })
      inserted++
    }
    doc = { ...doc, transformers }
  } else {
    let zones = [...doc.zones]
    const feederIds = new Set(doc.feeders.map((x) => x.id))
    for (let i = 0; i < keyed.length; i++) {
      const f = rowToZoneFields(keyed[i]!)
      const code = String(f.code ?? "").trim()
      const name = String(f.name ?? "").trim()
      const feederId = String(f.feederId ?? "").trim()
      if (!code || !name || !feederId) {
        rowErrors.push(`Row ${i + 2}: code, name, feeder ID required.`)
        continue
      }
      if (!feederIds.has(feederId)) {
        rowErrors.push(`Row ${i + 2}: unknown feeder ${feederId}.`)
        continue
      }
      const used = new Set(zones.map((x) => x.id))
      const idIn = String(f.id ?? "").trim()
      const idx = idIn ? zones.findIndex((x) => x.id === idIn) : -1
      if (idx >= 0) {
        zones[idx] = {
          id: idIn,
          code,
          name,
          feederId,
          notes: String(f.notes ?? "").trim(),
        }
        updated++
        continue
      }
      let id = idIn || allocateConfigId("gz", code, used)
      if (zones.some((x) => x.id === id)) {
        rowErrors.push(`Row ${i + 2}: id exists.`)
        continue
      }
      zones.push({ id, code, name, feederId, notes: String(f.notes ?? "").trim() })
      inserted++
    }
    doc = { ...doc, zones }
  }

  if (!validateGridTopologyDoc(doc)) {
    return NextResponse.json({ error: "INVALID_GRID_AFTER_IMPORT" }, { status: 400 })
  }
  const w = await writeGridTopologyDoc(doc)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    rowErrors: rowErrors.length ? rowErrors : undefined,
  })
}
