import { countFcs16 } from "@/lib/runtime/real/hdlc-fcs16"
import { fcs16MatchesWire } from "@/lib/runtime/real/hdlc-fcs-wire"

const FLAG = 0x7e

export const HDLC_SNRM = 0x93
export const HDLC_UA = 0x73
export const HDLC_DISC = 0x53
export const HDLC_I_FRAME_FIRST = 0x10
/** Second client I-frame (N(S)=1 mod 8) — common after first AARQ I-frame. */
export const HDLC_I_FRAME_SECOND = 0x30

/**
 * Build HDLC U-frame (no information field). Matches existing 1-byte formula extended to
 * variable address lengths: lengthByte = 5 + clientLen + serverLen (server = destination).
 */
export function buildHdlcUFrame(
  serverAddress: Uint8Array,
  clientAddress: Uint8Array,
  control: number
): Buffer {
  const lengthByte = 5 + clientAddress.length + serverAddress.length
  const header: number[] = [FLAG, 0xa0, lengthByte]
  for (let i = 0; i < serverAddress.length; i++) header.push(serverAddress[i])
  for (let i = 0; i < clientAddress.length; i++) header.push(clientAddress[i])
  header.push(control)
  const h1 = new Uint8Array(header)
  const crc1 = countFcs16(h1, 1, h1.length - 1)
  const after1: number[] = [...header, crc1 & 0xff, (crc1 >> 8) & 0xff, FLAG]
  return Buffer.from(after1)
}

/**
 * Build HDLC I-frame with LLC+APDU payload.
 * lengthByte = 7 + clientLen + serverLen + payload.length
 */
export function buildHdlcIFrame(
  serverAddress: Uint8Array,
  clientAddress: Uint8Array,
  control: number,
  payload: Uint8Array
): Buffer {
  const lengthByte = 7 + clientAddress.length + serverAddress.length + payload.length
  const header: number[] = [FLAG, 0xa0, lengthByte]
  for (let i = 0; i < serverAddress.length; i++) header.push(serverAddress[i])
  for (let i = 0; i < clientAddress.length; i++) header.push(clientAddress[i])
  header.push(control)
  const h1 = new Uint8Array(header)
  const crc1 = countFcs16(h1, 1, h1.length - 1)
  const after1: number[] = [...header, crc1 & 0xff, (crc1 >> 8) & 0xff]
  for (let i = 0; i < payload.length; i++) after1.push(payload[i])
  const h2 = new Uint8Array(after1)
  const crc2 = countFcs16(h2, 1, h2.length - 1)
  after1.push(crc2 & 0xff, (crc2 >> 8) & 0xff, FLAG)
  return Buffer.from(after1)
}

export type ParsedHdlcVariable =
  | {
      kind: "u"
      control: number
      dest: Uint8Array
      src: Uint8Array
    }
  | {
      kind: "i"
      control: number
      dest: Uint8Array
      src: Uint8Array
      llcAndApdu: Uint8Array
    }

/**
 * Parse one complete HDLC frame (0x7E … 0x7E) when destination/source widths are known
 * (vendor profile). Verifies both FCS fields.
 */
export function parseHdlcFrameWithAddressWidths(
  frame: Uint8Array,
  destLen: number,
  srcLen: number
): ParsedHdlcVariable | null {
  if (frame.length < 9 || frame[0] !== FLAG || frame[frame.length - 1] !== FLAG) {
    return null
  }
  const inner = frame.subarray(1, frame.length - 1)
  /** format(1) + length(1) + dest + src + control(1) + HCS(2) */
  if (inner.length < 5 + destLen + srcLen) return null
  if ((inner[0] & 0xf0) !== 0xa0) return null
  const ctrlIdx = 2 + destLen + srcLen
  const control = inner[ctrlIdx]
  const firstCrcIdx = ctrlIdx + 1
  const h0 = inner[firstCrcIdx]
  const h1 = inner[firstCrcIdx + 1]
  if (!fcs16MatchesWire(countFcs16(inner, 0, firstCrcIdx), h0, h1)) return null

  const dest = inner.subarray(2, 2 + destLen)
  const src = inner.subarray(2 + destLen, 2 + destLen + srcLen)
  const afterCrc1 = firstCrcIdx + 2
  if (afterCrc1 === inner.length) {
    return { kind: "u", control, dest, src }
  }

  const secondPart = inner.subarray(afterCrc1)
  if (secondPart.length < 2) return null
  const t0 = secondPart[secondPart.length - 2]
  const t1 = secondPart[secondPart.length - 1]
  const dataPart = secondPart.subarray(0, secondPart.length - 2)
  if (!fcs16MatchesWire(countFcs16(inner, 0, afterCrc1 + dataPart.length), t0, t1)) return null

  return { kind: "i", control, dest, src, llcAndApdu: dataPart }
}

export function splitHdlcFrames(buffer: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let i = 0
  while (i < buffer.length) {
    if (buffer[i] !== FLAG) {
      i++
      continue
    }
    const start = i
    i++
    while (i < buffer.length && buffer[i] !== FLAG) i++
    if (i >= buffer.length) break
    out.push(buffer.subarray(start, i + 1))
    i++
  }
  return out
}
