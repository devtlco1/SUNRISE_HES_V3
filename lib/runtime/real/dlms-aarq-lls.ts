import { LLC_SEND } from "@/lib/runtime/real/dlms-apdu"

/**
 * Gurux `GXDLMSSettings.getInitialConformance(true)` — proposed conformance for LN client (24-bit).
 * Source: gurux_dlms/GXDLMSSettings.py
 */
export const GURUX_INITIAL_LN_PROPOSED_CONFORMANCE = 0xba7802

/** Gurux `_GXCommon.swapBits` — per-byte bit reversal for conformance encoding. */
export function guruxSwapBits8(value: number): number {
  let v = value & 0xff
  let ret = 0
  for (let pos = 0; pos < 8; pos++) {
    ret = (ret << 1) | (v & 1)
    v >>= 1
  }
  return ret
}

/**
 * xDLMS InitiateRequest octets inside AARQ user-information (Gurux `_GXAPDU.getInitiateRequest`).
 * Default: no dedicated key, response-allowed default, QoS unused, DLMS version 6, max PDU 0xFFFF.
 */
export function buildGuruxStyleInitiateRequestOctets(options?: {
  proposedConformance24?: number
  dlmsVersion?: number
  maxPduSize?: number
}): Uint8Array {
  const proposed =
    options?.proposedConformance24 ?? GURUX_INITIAL_LN_PROPOSED_CONFORMANCE
  const ver = options?.dlmsVersion ?? 6
  const maxPdu = options?.maxPduSize ?? 0xffff
  const c0 = guruxSwapBits8(proposed & 0xff)
  const c1 = guruxSwapBits8((proposed >> 8) & 0xff)
  const c2 = guruxSwapBits8((proposed >> 16) & 0xff)
  const conformanceBlock = Buffer.from([
    0x5f,
    0x1f,
    0x04,
    0x00,
    c0,
    c1,
    c2,
    (maxPdu >> 8) & 0xff,
    maxPdu & 0xff,
  ])
  return Uint8Array.from(
    Buffer.concat([Buffer.from([0x01, 0x00, 0x00, 0x00, ver]), conformanceBlock])
  )
}

/**
 * CONTEXT|CONSTRUCTED [30] user-information wrapping InitiateRequest in an OCTET STRING.
 * Matches Gurux `_GXAPDU.generateUserInformation` for non-ciphered AARQ.
 */
export function buildGuruxStyleUserInformationBe(initiateOctets: Uint8Array): Uint8Array {
  if (initiateOctets.length > 0xfe) {
    throw new Error("initiate_request_too_long_for_short_ber_length")
  }
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0xbe, 2 + initiateOctets.length, 0x04, initiateOctets.length]),
      Buffer.from(initiateOctets),
    ])
  )
}

/**
 * COSEM AARQ APDU (tag 60…) for LN + LOW auth, matching Gurux `_GXAPDU.generateAarq` field order:
 * application context → ACSE sender requirements + mechanism + calling authentication → user-information (initiate).
 */
export type AarqInitiateWireOptions = {
  proposedConformance24?: number
  maxPduSize?: number
  dlmsVersion?: number
}

export function buildGuruxStyleLowLnCosemAarqApdu(
  passwordAscii: string,
  initiate?: AarqInitiateWireOptions
): Uint8Array {
  const pwd = Buffer.from(passwordAscii, "utf8")
  const acBlock = Buffer.concat([
    Buffer.from([0xac, pwd.length + 2, 0x80, pwd.length]),
    pwd,
  ])
  const initiateOctets = buildGuruxStyleInitiateRequestOctets(initiate)
  const userInfo = buildGuruxStyleUserInformationBe(initiateOctets)
  const inner = Buffer.concat([
    Buffer.from([
      0xa1, 0x09, 0x06, 0x07, 0x60, 0x85, 0x74, 0x05, 0x08, 0x01, 0x01,
    ]),
    Buffer.from([0x8a, 0x02, 0x07, 0x80]),
    Buffer.from([0x8b, 0x07, 0x60, 0x85, 0x74, 0x05, 0x08, 0x02, 0x01]),
    acBlock,
    Buffer.from(userInfo),
  ])
  return Uint8Array.from(
    Buffer.concat([Buffer.from([0x60, inner.length]), inner])
  )
}

/**
 * LLC `e6e600` + Gurux-shaped LOW-auth LN AARQ (MVP-AMI `aarqRequest()` / `getLnMessages` payload body).
 */
export function buildAarqLlsLnPayload(
  passwordAscii: string,
  initiate?: AarqInitiateWireOptions
): Uint8Array {
  const aarq = buildGuruxStyleLowLnCosemAarqApdu(passwordAscii, initiate)
  const out = new Uint8Array(LLC_SEND.length + aarq.length)
  out.set(LLC_SEND, 0)
  out.set(aarq, LLC_SEND.length)
  return out
}
