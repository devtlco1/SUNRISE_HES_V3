import { mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"

import type { RbacRole, RbacUser } from "@/types/rbac"

const DIR = "data"
const USERS_FILE = "rbac-users.json"
const ROLES_FILE = "rbac-roles.json"

export function rbacUsersPath(): string {
  return path.join(process.cwd(), DIR, USERS_FILE)
}

export function rbacRolesPath(): string {
  return path.join(process.cwd(), DIR, ROLES_FILE)
}

let writeChain: Promise<void> = Promise.resolve()

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn)
  writeChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function parseUsers(raw: unknown): RbacUser[] {
  if (!Array.isArray(raw)) return []
  const out: RbacUser[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    if (typeof o.id !== "string") continue
    if (typeof o.username !== "string") continue
    if (typeof o.displayName !== "string") continue
    if (typeof o.email !== "string") continue
    if (typeof o.roleId !== "string") continue
    if (typeof o.active !== "boolean") continue
    if (typeof o.createdAt !== "string") continue
    if (typeof o.updatedAt !== "string") continue
    out.push({
      id: o.id,
      username: o.username,
      displayName: o.displayName,
      email: o.email,
      roleId: o.roleId,
      active: o.active,
      team: typeof o.team === "string" ? o.team : undefined,
      phone: typeof o.phone === "string" ? o.phone : undefined,
      assignedScope: typeof o.assignedScope === "string" ? o.assignedScope : undefined,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })
  }
  return out
}

function parseRoles(raw: unknown): RbacRole[] {
  if (!Array.isArray(raw)) return []
  const out: RbacRole[] = []
  for (const x of raw) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    if (typeof o.id !== "string") continue
    if (typeof o.name !== "string") continue
    if (typeof o.description !== "string") continue
    if (!Array.isArray(o.permissionKeys)) continue
    const keys = o.permissionKeys.filter((k): k is string => typeof k === "string")
    if (typeof o.createdAt !== "string") continue
    if (typeof o.updatedAt !== "string") continue
    out.push({
      id: o.id,
      name: o.name,
      description: o.description,
      permissionKeys: keys,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })
  }
  return out
}

export async function readRbacUsersUnsafe(): Promise<RbacUser[]> {
  try {
    const text = await readFile(rbacUsersPath(), "utf-8")
    return parseUsers(JSON.parse(text) as unknown)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ENOENT") return []
    return []
  }
}

export async function readRbacRolesUnsafe(): Promise<RbacRole[]> {
  try {
    const text = await readFile(rbacRolesPath(), "utf-8")
    return parseRoles(JSON.parse(text) as unknown)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err?.code === "ENOENT") return []
    return []
  }
}

export async function writeRbacUsers(
  next: RbacUser[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueueWrite(async () => {
    try {
      const filePath = rbacUsersPath()
      await mkdir(path.dirname(filePath), { recursive: true })
      const tmp = `${filePath}.${process.pid}.tmp`
      await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
      await rename(tmp, filePath)
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "RBAC_USERS_WRITE_FAILED" }
    }
  })
}

export async function writeRbacRoles(
  next: RbacRole[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  return enqueueWrite(async () => {
    try {
      const filePath = rbacRolesPath()
      await mkdir(path.dirname(filePath), { recursive: true })
      const tmp = `${filePath}.${process.pid}.tmp`
      await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
      await rename(tmp, filePath)
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: "RBAC_ROLES_WRITE_FAILED" }
    }
  })
}
