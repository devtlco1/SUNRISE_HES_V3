import { normalizeCommandJobRows } from "@/lib/commands/normalize"
import type { CommandJobRow } from "@/types/command"

export type FetchCommandsResult =
  | { ok: true; rows: CommandJobRow[] }
  | { ok: false; error: string }

const LOAD_FAILED =
  "The command job catalog could not be loaded. Retry shortly or contact operations if this continues."
const INVALID_PAYLOAD =
  "The command job response was invalid. Verify the catalog source and deployment."
export const COMMANDS_FETCH_NETWORK_ERROR =
  "Network error while loading command jobs."

function messageForErrorCode(code: string | undefined): string {
  if (
    code === "INVALID_COMMANDS_PAYLOAD" ||
    code === "INVALID_COMMANDS_ROWS"
  ) {
    return INVALID_PAYLOAD
  }
  return LOAD_FAILED
}

/**
 * Client-side fetch of read-only command jobs from the local App Router API.
 */
export async function fetchCommandJobs(
  signal?: AbortSignal
): Promise<FetchCommandsResult> {
  try {
    const res = await fetch("/api/commands", {
      signal,
      cache: "no-store",
    })

    if (!res.ok) {
      let code: string | undefined
      try {
        const body = (await res.json()) as { error?: string }
        code = body.error
      } catch {
        /* ignore */
      }
      return { ok: false, error: messageForErrorCode(code) }
    }

    const data: unknown = await res.json()
    const rows = normalizeCommandJobRows(data)
    if (rows.length === 0 && Array.isArray(data) && data.length > 0) {
      return { ok: false, error: INVALID_PAYLOAD }
    }
    return { ok: true, rows }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw e
    }
    return { ok: false, error: COMMANDS_FETCH_NETWORK_ERROR }
  }
}
