const DEV_FALLBACK =
  "sunrise-dev-auth-secret-min-32-chars-do-not-use-in-prod"

/**
 * HMAC secret for signing session cookies. Required in production (min 32 chars).
 */
export function getAuthSecret(): string {
  const s = process.env.SUNRISE_AUTH_SECRET?.trim()
  if (s && s.length >= 32) return s
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SUNRISE_AUTH_SECRET must be set to a string of at least 32 characters."
    )
  }
  return DEV_FALLBACK
}
