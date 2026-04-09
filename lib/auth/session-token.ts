import { createHmac, timingSafeEqual } from "crypto"

import { getAuthSecret } from "@/lib/auth/secret"

const MAX_AGE_SEC = 60 * 60 * 24 * 7

type Payload = { uid: string; exp: number }

export function signSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const payload: Payload = { uid: userId, exp }
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  )
  const sig = createHmac("sha256", getAuthSecret())
    .update(payloadPart)
    .digest("base64url")
  return `${payloadPart}.${sig}`
}

export function verifySessionTokenUserId(token: string): string | null {
  const dot = token.indexOf(".")
  if (dot <= 0) return null
  const payloadPart = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payloadPart || !sig) return null
  const expected = createHmac("sha256", getAuthSecret())
    .update(payloadPart)
    .digest("base64url")
  const a = Buffer.from(sig, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let payload: Payload
  try {
    payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8")
    ) as Payload
  } catch {
    return null
  }
  if (typeof payload.uid !== "string" || typeof payload.exp !== "number") {
    return null
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload.uid
}
