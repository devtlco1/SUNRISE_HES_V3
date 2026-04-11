/**
 * `Secure` on session cookies: browsers drop them on plain HTTP if true.
 *
 * Resolution order:
 * 1. `SUNRISE_AUTH_COOKIE_SECURE` = `true` / `false` (or `1` / `0`) — explicit override.
 * 2. `x-forwarded-proto` first hop: `https` → true, `http` → false.
 * 3. `Request.url` scheme: `https:` → true, `http:` → false.
 * 4. Default **false** so raw IP / HTTP deployments work; use override `true` or
 *    terminate TLS at the proxy with `X-Forwarded-Proto: https` when the app
 *    only sees `http://` upstream.
 */
export function resolveAuthCookieSecure(req: Request): boolean {
  const raw = process.env.SUNRISE_AUTH_COOKIE_SECURE?.trim().toLowerCase()
  if (raw === "true" || raw === "1") return true
  if (raw === "false" || raw === "0") return false

  const forwarded = req.headers.get("x-forwarded-proto")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim().toLowerCase()
    if (first === "https") return true
    if (first === "http") return false
  }

  try {
    const u = new URL(req.url)
    if (u.protocol === "https:") return true
    if (u.protocol === "http:") return false
  } catch {
    /* ignore */
  }

  return false
}
