import { summarizeFastApiValidationDetail } from "@/lib/readings/python-sidecar-proxy-error"
import type { PythonSidecarHttpError } from "@/lib/runtime/python-sidecar/client"

function pathnameFromUrl(url: string | undefined): string {
  if (!url) return "sidecar"
  try {
    return new URL(url).pathname || url
  } catch {
    return url.slice(0, 120)
  }
}

/**
 * Operator-facing lines when the sidecar returns non-2xx (500, 502, etc.).
 */
export function summarizeCommandSidecarHttpError(
  e: PythonSidecarHttpError,
  ctx: { actionLabel: string; transport: "inbound_tcp" | "direct_tcp" }
): { summary: string; detail: string } {
  const path = pathnameFromUrl(e.requestUrl)
  let detail = e.bodyText.replace(/\s+/g, " ").trim().slice(0, 900)
  try {
    const j = JSON.parse(e.bodyText) as Record<string, unknown>
    if (typeof j.detail === "string" && j.detail.trim()) {
      detail = j.detail.trim().slice(0, 900)
    } else if (Array.isArray(j.detail)) {
      const flat = summarizeFastApiValidationDetail(j)
      if (flat.trim()) detail = flat.trim().slice(0, 900)
    }
    if (typeof j.message === "string" && j.message.trim() && detail.length < 20) {
      detail = j.message.trim().slice(0, 900)
    }
  } catch {
    /* keep bodyText */
  }

  const transport =
    ctx.transport === "inbound_tcp" ? "inbound listener" : "direct runtime"
  const summary = `${ctx.actionLabel} (${transport}) failed: HTTP ${e.status} on ${path}`

  return { summary, detail }
}
