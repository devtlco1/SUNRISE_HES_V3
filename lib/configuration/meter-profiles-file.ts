import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import type { MeterProfileRow } from "@/types/configuration"

const FILE = "meter-profiles.json"

export function meterProfilesJsonPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

export async function readMeterProfilesRaw(): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "METER_PROFILES_LOAD_FAILED" | "INVALID_METER_PROFILES_PAYLOAD" }
> {
  try {
    const text = await readFile(meterProfilesJsonPath(), "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "INVALID_METER_PROFILES_PAYLOAD" }
    }
    return { ok: true, parsed }
  } catch {
    return { ok: false, error: "METER_PROFILES_LOAD_FAILED" }
  }
}

export async function writeMeterProfilesArray(
  next: MeterProfileRow[]
): Promise<{ ok: true } | { ok: false; error: "METER_PROFILES_WRITE_FAILED" }> {
  const filePath = meterProfilesJsonPath()
  try {
    await mkdir(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "METER_PROFILES_WRITE_FAILED" }
  }
}
