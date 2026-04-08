import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

const DIR = "data"

export function commandGroupsJsonPath(): string {
  return path.join(process.cwd(), DIR, "command-groups.json")
}

export function commandSchedulesJsonPath(): string {
  return path.join(process.cwd(), DIR, "command-schedules.json")
}

export function commandOperatorRunsJsonPath(): string {
  return path.join(process.cwd(), DIR, "command-runs.json")
}

export function commandObisCodeGroupsJsonPath(): string {
  return path.join(process.cwd(), DIR, "command-obis-groups.json")
}

async function readJsonArray(
  filePath: string
): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "LOAD_FAILED" | "INVALID_PAYLOAD" }
> {
  try {
    const text = await readFile(filePath, "utf-8")
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "INVALID_PAYLOAD" }
    }
    return { ok: true, parsed }
  } catch {
    return { ok: false, error: "LOAD_FAILED" }
  }
}

async function writeJsonArray(
  filePath: string,
  next: unknown[]
): Promise<{ ok: true } | { ok: false; error: "WRITE_FAILED" }> {
  try {
    const dir = path.dirname(filePath)
    await mkdir(dir, { recursive: true })
    const tmp = `${filePath}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
    await rename(tmp, filePath)
    return { ok: true }
  } catch {
    return { ok: false, error: "WRITE_FAILED" }
  }
}

export async function readCommandGroupsRaw(): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "LOAD_FAILED" | "INVALID_PAYLOAD" }
> {
  return readJsonArray(commandGroupsJsonPath())
}

export async function writeCommandGroupsArray(
  next: unknown[]
): Promise<{ ok: true } | { ok: false; error: "WRITE_FAILED" }> {
  return writeJsonArray(commandGroupsJsonPath(), next)
}

export async function readCommandSchedulesRaw(): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "LOAD_FAILED" | "INVALID_PAYLOAD" }
> {
  return readJsonArray(commandSchedulesJsonPath())
}

export async function writeCommandSchedulesArray(
  next: unknown[]
): Promise<{ ok: true } | { ok: false; error: "WRITE_FAILED" }> {
  return writeJsonArray(commandSchedulesJsonPath(), next)
}

export async function readOperatorRunsRaw(): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "LOAD_FAILED" | "INVALID_PAYLOAD" }
> {
  return readJsonArray(commandOperatorRunsJsonPath())
}

export async function writeOperatorRunsArray(
  next: unknown[]
): Promise<{ ok: true } | { ok: false; error: "WRITE_FAILED" }> {
  return writeJsonArray(commandOperatorRunsJsonPath(), next)
}

export async function readObisCodeGroupsRaw(): Promise<
  | { ok: true; parsed: unknown[] }
  | { ok: false; error: "LOAD_FAILED" | "INVALID_PAYLOAD" }
> {
  return readJsonArray(commandObisCodeGroupsJsonPath())
}

export async function writeObisCodeGroupsArray(
  next: unknown[]
): Promise<{ ok: true } | { ok: false; error: "WRITE_FAILED" }> {
  return writeJsonArray(commandObisCodeGroupsJsonPath(), next)
}
