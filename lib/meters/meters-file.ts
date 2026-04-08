import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

const FILE = "meters.json"

export function metersJsonPath(): string {
  return path.join(process.cwd(), "data", FILE)
}

export async function readMetersJsonRaw(): Promise<
  | { ok: true; parsed: unknown[]; text: string }
  | { ok: false; error: "METERS_LOAD_FAILED" | "INVALID_METERS_PAYLOAD" }
> {
  try {
    const filePath = metersJsonPath()
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "INVALID_METERS_PAYLOAD" }
    }
    return { ok: true, parsed, text }
  } catch {
    return { ok: false, error: "METERS_LOAD_FAILED" }
  }
}

export async function writeMetersJsonArray(next: unknown[]): Promise<
  { ok: true } | { ok: false; error: "METERS_WRITE_FAILED" }
> {
  const filePath = metersJsonPath()
  try {
    const dir = path.dirname(filePath)
    await mkdir(dir, { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "METERS_WRITE_FAILED" }
  }
}
