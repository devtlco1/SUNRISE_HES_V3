import {
  emptyGridTopologyDoc,
  normalizeGridTopologyDoc,
  readGridTopologyRaw,
  validateGridTopologyDoc,
  writeGridTopologyDoc,
} from "@/lib/configuration/grid-topology-file"
import type { GridTopologyDoc } from "@/types/configuration"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const raw = await readGridTopologyRaw()
  if (!raw.ok) {
    if (raw.error === "GRID_TOPOLOGY_LOAD_FAILED") {
      return NextResponse.json(emptyGridTopologyDoc(), {
        headers: { "Cache-Control": "no-store" },
      })
    }
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  return NextResponse.json(raw.doc, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PUT(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const doc = normalizeGridTopologyDoc(body)
  if (!doc || !validateGridTopologyDoc(doc)) {
    return NextResponse.json({ error: "INVALID_GRID_DOC" }, { status: 400 })
  }
  const w = await writeGridTopologyDoc(doc)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json(doc, {
    headers: { "Cache-Control": "no-store" },
  })
}
