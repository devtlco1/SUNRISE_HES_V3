/**
 * Single operator-facing datetime format for visible UI (local clock, no TZ label).
 * Storage and API payloads stay as-is (typically ISO strings).
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * `YYYY-MM-DD | HH:mm:ss` in the runtime's local timezone.
 * `null`, `undefined`, empty string, whitespace-only, or unparseable → `—`.
 */
export function formatOperatorDateTime(
  isoOrMs: string | number | null | undefined
): string {
  if (isoOrMs === null || isoOrMs === undefined) return "—"
  const d =
    typeof isoOrMs === "number"
      ? Number.isFinite(isoOrMs)
        ? new Date(isoOrMs)
        : null
      : (() => {
          const t = String(isoOrMs).trim()
          if (!t) return null
          const x = new Date(t)
          return Number.isNaN(x.getTime()) ? null : x
        })()
  if (!d) return "—"
  const y = d.getFullYear()
  const mo = pad2(d.getMonth() + 1)
  const da = pad2(d.getDate())
  const h = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  const s = pad2(d.getSeconds())
  return `${y}-${mo}-${da} | ${h}:${mi}:${s}`
}
