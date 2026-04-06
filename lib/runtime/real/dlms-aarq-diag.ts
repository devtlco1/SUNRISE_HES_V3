import { LLC_SEND } from "@/lib/runtime/real/dlms-apdu"

export type AarqBuilderKind = "LOW_LLS_LN" | "LN_MINIMAL_NO_AUTH"

/**
 * Developer-oriented breakdown of the LLC + COSEM AARQ payload (I-frame information field).
 * `callingAuthenticationValueHex` embeds password octets — treat as secret in exported traces.
 */
export type OutboundAarqPayloadDiag = {
  builder: AarqBuilderKind
  llcHex: string
  /** Expected LLC for client→server AARQ (reference). */
  expectedLlcSendHex: string
  llcMatchesReference: boolean
  /** COSEM APDU only (tag 60…), no LLC. */
  cosemAarqApduHex: string
  /** Full LLC + APDU as transmitted inside I-frame information field. */
  llcPlusApduHex: string
  passwordUtf8ByteLength: number | null
  /** Raw TLV for context [0] calling-authentication-value (tag AC…), or null if absent. */
  callingAuthenticationValueHex: string | null
  /** ASCII interpretation of the OCTET STRING inside AC when valid UTF-8. */
  passwordWireAsUtf8: string | null
  /**
   * MVP-AMI uses Gurux `parseUAResponse(ua_info)` before `aarqRequest()`; negotiated
   * max-PDU / window may differ from this static LN+LLS template. Compare on-wire hex if meter is silent.
   */
  mvpAmiAlignmentNote: string
}

/**
 * Find first AC (0xac) calling-authentication block; assumes short definite length on AC.
 */
function extractCallingAuthDiag(apdu: Uint8Array): {
  callingAuthenticationValueHex: string | null
  passwordUtf8ByteLength: number | null
  passwordWireAsUtf8: string | null
} {
  for (let i = 0; i < apdu.length - 4; i++) {
    if (apdu[i] !== 0xac) continue
    const L = apdu[i + 1]
    if (L === undefined || L >= 0x80) continue
    if (i + 2 + L > apdu.length) continue
    const block = apdu.subarray(i, i + 2 + L)
    const inner = apdu.subarray(i + 2, i + 2 + L)
    if (inner.length >= 2 && inner[0] === 0x80) {
      const octLen = inner[1]
      const oct = inner.subarray(2, 2 + octLen)
      if (2 + octLen <= inner.length) {
        let utf8: string | null = null
        try {
          utf8 = Buffer.from(oct).toString("utf8")
          if (Buffer.from(utf8, "utf8").length !== oct.length) utf8 = null
        } catch {
          utf8 = null
        }
        return {
          callingAuthenticationValueHex: Buffer.from(block).toString("hex"),
          passwordUtf8ByteLength: oct.length,
          passwordWireAsUtf8: utf8,
        }
      }
    }
    return {
      callingAuthenticationValueHex: Buffer.from(block).toString("hex"),
      passwordUtf8ByteLength: null,
      passwordWireAsUtf8: null,
    }
  }
  return {
    callingAuthenticationValueHex: null,
    passwordUtf8ByteLength: null,
    passwordWireAsUtf8: null,
  }
}

/** Describe LLC + AARQ bytes (payload of `buildHdlcIFrame`). */
export function describeOutboundAarqPayload(
  llcPlusApdu: Uint8Array,
  builder: AarqBuilderKind
): OutboundAarqPayloadDiag {
  const expectedLlcSendHex = Buffer.from(LLC_SEND).toString("hex")
  const llcHex = Buffer.from(llcPlusApdu.subarray(0, Math.min(3, llcPlusApdu.length))).toString("hex")
  const rest = llcPlusApdu.length > 3 ? llcPlusApdu.subarray(3) : new Uint8Array(0)
  const auth = extractCallingAuthDiag(rest)
  return {
    builder,
    llcHex,
    expectedLlcSendHex,
    llcMatchesReference: llcHex === expectedLlcSendHex,
    cosemAarqApduHex: Buffer.from(rest).toString("hex"),
    llcPlusApduHex: Buffer.from(llcPlusApdu).toString("hex"),
    passwordUtf8ByteLength: auth.passwordUtf8ByteLength,
    callingAuthenticationValueHex: auth.callingAuthenticationValueHex,
    passwordWireAsUtf8: auth.passwordWireAsUtf8,
    mvpAmiAlignmentNote:
      "MVP-AMI/Gurux: parseUAResponse(UA info) then aarqRequest(); static template may omit UA-negotiated sizes.",
  }
}
