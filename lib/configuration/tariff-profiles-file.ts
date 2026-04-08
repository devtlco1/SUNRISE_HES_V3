import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import type { TariffProfileRow } from "@/types/configuration"

const FILE = "tariff-profiles.json"

export function tariffProfilesJsonPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

export async function readTariffProfilesRaw(): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "TARIFF_PROFILES_LOAD_FAILED" | "INVALID_TARIFF_PROFILES_PAYLOAD" }
> {
  try {
    const text = await readFile(tariffProfilesJsonPath(), "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "INVALID_TARIFF_PROFILES_PAYLOAD" }
    }
    return { ok: true, parsed }
  } catch {
    return { ok: false, error: "TARIFF_PROFILES_LOAD_FAILED" }
  }
}

export async function writeTariffProfilesArray(
  next: TariffProfileRow[]
): Promise<{ ok: true } | { ok: false; error: "TARIFF_PROFILES_WRITE_FAILED" }> {
  const filePath = tariffProfilesJsonPath()
  try {
    await mkdir(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "TARIFF_PROFILES_WRITE_FAILED" }
  }
}
