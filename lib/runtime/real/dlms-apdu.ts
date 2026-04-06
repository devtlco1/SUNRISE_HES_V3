/**
 * Minimal COSEM AARQ / AARE helpers (LN, no dedicated security in AARQ).
 * LLC bytes per IEC 62056-46.
 */

export const LLC_SEND = new Uint8Array([0xe6, 0xe6, 0x00])
export const LLC_REPLY = new Uint8Array([0xe6, 0xe7, 0x00])

/**
 * Short AARQ: application context LN + mechanism name (no auth, no user-id).
 * Suitable only for meters that accept public / LLS-none association.
 */
export const AARQ_LN_MINIMAL = new Uint8Array([
  0x60, 0x18, 0xa1, 0x09, 0x06, 0x07, 0x60, 0x85, 0x74, 0x05, 0x08, 0x01, 0x01, 0x8a,
  0x02, 0x07, 0x80, 0x8b, 0x07, 0x60, 0x85, 0x74, 0x05, 0x08, 0x02, 0x01,
])

export function buildAarqPayload(): Uint8Array {
  const out = new Uint8Array(LLC_SEND.length + AARQ_LN_MINIMAL.length)
  out.set(LLC_SEND, 0)
  out.set(AARQ_LN_MINIMAL, LLC_SEND.length)
  return out
}

export function stripLeadingLlcReply(llcAndApdu: Uint8Array): Uint8Array {
  if (
    llcAndApdu.length >= LLC_REPLY.length &&
    llcAndApdu[0] === LLC_REPLY[0] &&
    llcAndApdu[1] === LLC_REPLY[1] &&
    llcAndApdu[2] === LLC_REPLY[2]
  ) {
    return llcAndApdu.subarray(LLC_REPLY.length)
  }
  return llcAndApdu
}

/**
 * Find AARE (tag 0x61) association-result (tag 0xA2, ENUM).
 * Returns raw enum (0 = accepted per COSEM).
 */
export function parseAareAssociationResult(apdu: Uint8Array): {
  result: number
} | null {
  let off = -1
  for (let i = 0; i <= apdu.length - 2; i++) {
    if (apdu[i] === 0x61) {
      off = i
      break
    }
  }
  if (off < 0) return null

  for (let i = off; i <= apdu.length - 5; i++) {
    if (
      apdu[i] === 0xa2 &&
      apdu[i + 1] === 0x03 &&
      apdu[i + 2] === 0x02 &&
      apdu[i + 3] === 0x01
    ) {
      return { result: apdu[i + 4] }
    }
  }
  return null
}

export function apduToHex(apdu: Uint8Array): string {
  return Buffer.from(apdu).toString("hex")
}
