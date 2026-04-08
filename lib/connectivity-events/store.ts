import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import type { ConnectivityEventRecord } from "@/types/connectivity-events"

const FILE = "connectivity-events.json"
export const CONNECTIVITY_EVENTS_MAX = 8000

export function connectivityEventsPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

export async function readConnectivityEventsRaw(): Promise<
  | { ok: true; events: ConnectivityEventRecord[] }
  | { ok: false; error: "CONNECTIVITY_EVENTS_LOAD_FAILED" | "INVALID_CONNECTIVITY_EVENTS_PAYLOAD" }
> {
  try {
    const filePath = connectivityEventsPath()
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "INVALID_CONNECTIVITY_EVENTS_PAYLOAD" }
    }
    const events: ConnectivityEventRecord[] = []
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue
      const o = x as Record<string, unknown>
      if (typeof o.id !== "string") continue
      if (typeof o.eventType !== "string") continue
      if (typeof o.createdAt !== "string") continue
      events.push(o as ConnectivityEventRecord)
    }
    return { ok: true, events }
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ENOENT") {
      return { ok: true, events: [] }
    }
    return { ok: false, error: "CONNECTIVITY_EVENTS_LOAD_FAILED" }
  }
}

export async function writeConnectivityEventsArray(
  next: ConnectivityEventRecord[]
): Promise<{ ok: true } | { ok: false; error: "CONNECTIVITY_EVENTS_WRITE_FAILED" }> {
  const filePath = connectivityEventsPath()
  try {
    const dir = path.dirname(filePath)
    await mkdir(dir, { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    const trimmed = next.slice(-CONNECTIVITY_EVENTS_MAX)
    await writeFile(tmp, `${JSON.stringify(trimmed, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "CONNECTIVITY_EVENTS_WRITE_FAILED" }
  }
}

/** Strip internal fields for browser consumption. */
export function toPublicConnectivityEvent(e: ConnectivityEventRecord): Omit<
  ConnectivityEventRecord,
  "dedupeKey"
> {
  const { dedupeKey: _d, ...rest } = e
  return rest
}
