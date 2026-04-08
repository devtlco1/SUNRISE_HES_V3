import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import type {
  FeederRow,
  GridTopologyDoc,
  TransformerRow,
  ZoneRow,
} from "@/types/configuration"

const FILE = "grid-topology.json"

export function gridTopologyJsonPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function normFeeder(raw: unknown): FeederRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const code = str(r.code)
  const name = str(r.name)
  if (!id || !code || !name) return null
  return { id, code, name, notes: str(r.notes) }
}

function normTransformer(raw: unknown): TransformerRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const code = str(r.code)
  const name = str(r.name)
  const feederId = str(r.feederId)
  if (!id || !code || !name || !feederId) return null
  return { id, code, name, feederId, notes: str(r.notes) }
}

function normZone(raw: unknown): ZoneRow | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = str(r.id)
  const code = str(r.code)
  const name = str(r.name)
  const feederId = str(r.feederId)
  if (!id || !code || !name || !feederId) return null
  return { id, code, name, feederId, notes: str(r.notes) }
}

export function normalizeGridTopologyDoc(raw: unknown): GridTopologyDoc | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const feedersIn = Array.isArray(o.feeders) ? o.feeders : []
  const transformersIn = Array.isArray(o.transformers) ? o.transformers : []
  const zonesIn = Array.isArray(o.zones) ? o.zones : []
  const feeders = feedersIn.map(normFeeder).filter((x): x is FeederRow => x !== null)
  const transformers = transformersIn
    .map(normTransformer)
    .filter((x): x is TransformerRow => x !== null)
  const zones = zonesIn.map(normZone).filter((x): x is ZoneRow => x !== null)
  return { feeders, transformers, zones }
}

export function validateGridTopologyDoc(doc: GridTopologyDoc): boolean {
  const feederIds = new Set(doc.feeders.map((f) => f.id))
  for (const t of doc.transformers) {
    if (!feederIds.has(t.feederId)) return false
  }
  for (const z of doc.zones) {
    if (!feederIds.has(z.feederId)) return false
  }
  return true
}

export async function readGridTopologyRaw(): Promise<
  | { ok: true; doc: GridTopologyDoc }
  | { ok: false; error: "GRID_TOPOLOGY_LOAD_FAILED" | "INVALID_GRID_TOPOLOGY_PAYLOAD" }
> {
  try {
    const text = await readFile(gridTopologyJsonPath(), "utf-8")
    const parsed: unknown = JSON.parse(text)
    const doc = normalizeGridTopologyDoc(parsed)
    if (!doc) return { ok: false, error: "INVALID_GRID_TOPOLOGY_PAYLOAD" }
    if (!validateGridTopologyDoc(doc)) {
      return { ok: false, error: "INVALID_GRID_TOPOLOGY_PAYLOAD" }
    }
    return { ok: true, doc }
  } catch {
    return { ok: false, error: "GRID_TOPOLOGY_LOAD_FAILED" }
  }
}

export async function writeGridTopologyDoc(
  doc: GridTopologyDoc
): Promise<{ ok: true } | { ok: false; error: "GRID_TOPOLOGY_WRITE_FAILED" }> {
  if (!validateGridTopologyDoc(doc)) {
    return { ok: false, error: "GRID_TOPOLOGY_WRITE_FAILED" }
  }
  const filePath = gridTopologyJsonPath()
  try {
    await mkdir(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "GRID_TOPOLOGY_WRITE_FAILED" }
  }
}

export function emptyGridTopologyDoc(): GridTopologyDoc {
  return { feeders: [], transformers: [], zones: [] }
}
