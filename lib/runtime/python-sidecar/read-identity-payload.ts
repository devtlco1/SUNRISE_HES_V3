import { parseRuntimeTargetBody } from "@/lib/runtime/contracts"
import type { ReadIdentityRequest } from "@/types/runtime"

/** JSON body forwarded to Python (extends runtime target with optional channel spec). */
export type PythonReadIdentityRequest = ReadIdentityRequest & {
  channel?: Record<string, unknown>
}

export function parsePythonReadIdentityRequest(
  body: unknown
): PythonReadIdentityRequest | null {
  const base = parseRuntimeTargetBody(body)
  if (!base) return null
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return base
  }
  const o = body as Record<string, unknown>
  if (!("channel" in o)) return base
  const ch = o.channel
  if (ch === undefined) return base
  if (ch !== null && (typeof ch !== "object" || Array.isArray(ch))) {
    return null
  }
  return { ...base, channel: ch as Record<string, unknown> }
}
