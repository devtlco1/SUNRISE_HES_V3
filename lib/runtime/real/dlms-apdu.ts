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

function matchesLlc3(buf: Uint8Array, llc: Uint8Array): boolean {
  return (
    buf.length >= llc.length &&
    buf[0] === llc[0] &&
    buf[1] === llc[1] &&
    buf[2] === llc[2]
  )
}

/** How LLC was handled before APDU search (some meters echo e6e600 on inbound I-frames). */
export type MeterLlcStripKind = "reply_e6e700" | "send_e6e600" | "raw"

/**
 * Ordered APDU views: standard reply LLC first, then send LLC (echo), then unmodified.
 * Deduplicates identical slices.
 */
export function listLlcStripVariantsForMeterReply(
  llcAndApdu: Uint8Array
): Array<{ strip: MeterLlcStripKind; apdu: Uint8Array }> {
  const out: Array<{ strip: MeterLlcStripKind; apdu: Uint8Array }> = []
  const seen = new Set<string>()
  const push = (strip: MeterLlcStripKind, apdu: Uint8Array) => {
    const k = Buffer.from(apdu).toString("hex")
    if (seen.has(k)) return
    seen.add(k)
    out.push({ strip, apdu })
  }
  if (matchesLlc3(llcAndApdu, LLC_REPLY)) {
    push("reply_e6e700", llcAndApdu.subarray(LLC_REPLY.length))
  }
  if (matchesLlc3(llcAndApdu, LLC_SEND)) {
    push("send_e6e600", llcAndApdu.subarray(LLC_SEND.length))
  }
  push("raw", llcAndApdu)
  return out
}

/**
 * Find AARE (tag 0x61) and association-result [2] (tag 0xA2) with ENUM contents 02 01 xx.
 * Scans from the first 0x61; within the remainder, accepts any short-form A2 length L>=3
 * whose value starts with BER ENUM 02 01 (COSEM / Gurux style).
 */
export function parseAareAssociationResult(apdu: Uint8Array): {
  result: number
} | null {
  let aareOff = -1
  for (let i = 0; i < apdu.length; i++) {
    if (apdu[i] === 0x61) {
      aareOff = i
      break
    }
  }
  if (aareOff < 0) return null

  const rest = apdu.subarray(aareOff)
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== 0xa2) continue
    let contentOff = i + 2
    let L = rest[i + 1]
    if (L === undefined) continue
    /** One-byte long form 81 LL (still tiny content) */
    if (L === 0x81) {
      L = rest[i + 2]
      contentOff = i + 3
    } else if (L >= 0x80) {
      continue
    }
    if (L < 3 || contentOff + L > rest.length) continue
    if (rest[contentOff] === 0x02 && rest[contentOff + 1] === 0x01) {
      const enumVal = rest[contentOff + 2]
      return { result: enumVal }
    }
  }
  return null
}

export function apduToHex(apdu: Uint8Array): string {
  return Buffer.from(apdu).toString("hex")
}
