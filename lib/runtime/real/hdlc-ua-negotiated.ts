/**
 * Parse UA information field per Gurux `GXDLMS.parseSnrmUaResponse` / MVP-AMI `_extract_ua_information_field`.
 * TLV ids: MAX_INFO_TX=5, MAX_INFO_RX=6, WINDOW_SIZE_TX=7, WINDOW_SIZE_RX=8.
 * Gurux maps UA MAX_INFO_RX → client `hdlc.maxInfoTX`, UA MAX_INFO_TX → `hdlc.maxInfoRX`, etc.
 */

import { enumerateAllValidHdlcParses } from "@/lib/runtime/real/hdlc-frame-inspect"
import { HDLC_UA } from "@/lib/runtime/real/hdlc-frame-variable"

const MAX_INFO_TX = 0x05
const MAX_INFO_RX = 0x06
const WINDOW_SIZE_TX = 0x07
const WINDOW_SIZE_RX = 0x08

export type NegotiatedHdlcLikeGurux = {
  maxInfoTX: number
  maxInfoRX: number
  windowSizeTX: number
  windowSizeRX: number
  parseSource: "ua_information_tlv" | "fallback_gurux_defaults"
  uaInformationFieldHexCapped: string | null
  parseNote: string
}

const GURUX_DEFAULT_MAX_INFO = 128
const GURUX_DEFAULT_WINDOW = 1

function capHex(hex: string, max: number): string {
  return hex.length <= max ? hex : `${hex.slice(0, max)}…`
}

/** `81 80 <len>` wrapper: return slice Gurux consumes (including the three prefix octets). */
function extract81_80Chunk(inner: Uint8Array): Uint8Array | null {
  for (let i = 0; i + 3 <= inner.length; i++) {
    if (inner[i] !== 0x81 || inner[i + 1] !== 0x80) continue
    const l = inner[i + 2] ?? 0
    if (i + 3 + l > inner.length) return null
    return inner.subarray(i, i + 3 + l)
  }
  return null
}

function readUaInformationBytesFromFrame(uaFrame: Uint8Array): Uint8Array | null {
  for (const v of enumerateAllValidHdlcParses(uaFrame)) {
    if (v.parsed.control !== HDLC_UA) continue
    if (v.parsed.kind === "i" && v.parsed.llcAndApdu.length > 0) {
      return v.parsed.llcAndApdu
    }
  }
  if (uaFrame.length < 2 || uaFrame[0] !== 0x7e) return null
  const inner = uaFrame.subarray(1, uaFrame.length - 1)
  return extract81_80Chunk(inner)
}

function readBeUint32(buf: Uint8Array, pos: number): { value: number; next: number } | null {
  if (pos + 4 > buf.length) return null
  const value =
    ((buf[pos]! & 0xff) << 24) |
    ((buf[pos + 1]! & 0xff) << 16) |
    ((buf[pos + 2]! & 0xff) << 8) |
    (buf[pos + 3]! & 0xff)
  return { value: value >>> 0, next: pos + 4 }
}

function readBeUint16(buf: Uint8Array, pos: number): { value: number; next: number } | null {
  if (pos + 2 > buf.length) return null
  const value = ((buf[pos]! & 0xff) << 8) | (buf[pos + 1]! & 0xff)
  return { value, next: pos + 2 }
}

function parseGuruxUaTlvAfterPrefix(buf: Uint8Array): Omit<
  NegotiatedHdlcLikeGurux,
  "parseSource" | "uaInformationFieldHexCapped" | "parseNote"
> | null {
  if (buf.length < 6) return null
  let pos = 3
  let maxTx = GURUX_DEFAULT_MAX_INFO
  let maxRx = GURUX_DEFAULT_MAX_INFO
  let winTx = GURUX_DEFAULT_WINDOW
  let winRx = GURUX_DEFAULT_WINDOW
  while (pos < buf.length) {
    const id = buf[pos++]
    if (id === undefined) break
    const lenTag = buf[pos++]
    if (lenTag === undefined) return null
    let val = 0
    if (lenTag === 1) {
      val = buf[pos++] ?? 0
    } else if (lenTag === 2) {
      const r = readBeUint16(buf, pos)
      if (!r) return null
      val = r.value
      pos = r.next
    } else if (lenTag === 4) {
      const r = readBeUint32(buf, pos)
      if (!r) return null
      val = r.value
      pos = r.next
    } else {
      return null
    }
    if (id === MAX_INFO_RX) maxTx = val
    else if (id === MAX_INFO_TX) maxRx = val
    else if (id === WINDOW_SIZE_RX) winTx = val
    else if (id === WINDOW_SIZE_TX) winRx = val
    else return null
  }
  return {
    maxInfoTX: Math.max(32, Math.min(maxTx, 0xffff)),
    maxInfoRX: Math.max(32, Math.min(maxRx, 0xffff)),
    windowSizeTX: Math.max(1, Math.min(winTx, 0xffff)),
    windowSizeRX: Math.max(1, Math.min(winRx, 0xffff)),
  }
}

/**
 * Extract negotiated HDLC sizes from a complete UA frame (7E…7E), or fall back to Gurux defaults (128/128/1/1).
 */
export function parseNegotiatedHdlcFromUaFrame(uaFrame: Uint8Array): NegotiatedHdlcLikeGurux {
  const info = readUaInformationBytesFromFrame(uaFrame)
  if (!info || info.length < 6) {
    return {
      maxInfoTX: GURUX_DEFAULT_MAX_INFO,
      maxInfoRX: GURUX_DEFAULT_MAX_INFO,
      windowSizeTX: GURUX_DEFAULT_WINDOW,
      windowSizeRX: GURUX_DEFAULT_WINDOW,
      parseSource: "fallback_gurux_defaults",
      uaInformationFieldHexCapped: null,
      parseNote: "no_ua_information_field_or_too_short",
    }
  }
  const parsed = parseGuruxUaTlvAfterPrefix(info)
  if (!parsed) {
    return {
      maxInfoTX: GURUX_DEFAULT_MAX_INFO,
      maxInfoRX: GURUX_DEFAULT_MAX_INFO,
      windowSizeTX: GURUX_DEFAULT_WINDOW,
      windowSizeRX: GURUX_DEFAULT_WINDOW,
      parseSource: "fallback_gurux_defaults",
      uaInformationFieldHexCapped: capHex(Buffer.from(info).toString("hex"), 256),
      parseNote: "ua_information_present_but_tlv_parse_failed",
    }
  }
  return {
    ...parsed,
    parseSource: "ua_information_tlv",
    uaInformationFieldHexCapped: capHex(Buffer.from(info).toString("hex"), 256),
    parseNote: "gurux_parseSnrmUaResponse_compatible_tlv",
  }
}
