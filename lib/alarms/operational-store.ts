import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import type { OperationalAlarmRecord } from "@/types/operational-alarm"

const FILE = "operational-alarms.json"

export function operationalAlarmsPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

let alarmsWriteChain: Promise<void> = Promise.resolve()

function enqueueAlarmsWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = alarmsWriteChain.then(fn, fn)
  alarmsWriteChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function readOperationalAlarmsRaw(): Promise<OperationalAlarmRecord[]> {
  try {
    const text = await readFile(operationalAlarmsPath(), "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    const out: OperationalAlarmRecord[] = []
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue
      const o = x as Record<string, unknown>
      if (typeof o.id !== "string") continue
      if (typeof o.sourceType !== "string") continue
      if (typeof o.alarmType !== "string") continue
      if (typeof o.title !== "string") continue
      if (typeof o.message !== "string") continue
      if (o.status !== "active" && o.status !== "cleared") continue
      if (typeof o.createdAt !== "string") continue
      if (typeof o.updatedAt !== "string") continue
      if (o.severity !== "info" && o.severity !== "warning" && o.severity !== "critical")
        continue
      out.push(o as OperationalAlarmRecord)
    }
    return out
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ENOENT") return []
    return []
  }
}

export async function writeOperationalAlarmsArray(
  next: OperationalAlarmRecord[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueueAlarmsWrite(async () => {
    const filePath = operationalAlarmsPath()
    try {
      const dir = path.dirname(filePath)
      await mkdir(dir, { recursive: true })
      const tmp = `${filePath}.${process.pid}.tmp`
      await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
      await rename(tmp, filePath)
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "OPERATIONAL_ALARMS_WRITE_FAILED" }
    }
  })
}
