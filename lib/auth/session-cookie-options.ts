/** Session lifetime for signed cookie (seconds). */
export const AUTH_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7

export type AuthSessionCookieBase = {
  httpOnly: true
  sameSite: "lax"
  secure: boolean
  path: "/"
}

export function authSessionCookieBase(secure: boolean): AuthSessionCookieBase {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  }
}
