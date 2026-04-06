import { encodeHdlcAddress1Byte } from "@/lib/runtime/real/hdlc-address"
import { countFcs16 } from "@/lib/runtime/real/hdlc-fcs16"

const FLAG = 0x7e

export const HDLC_SNRM = 0x93
export const HDLC_UA = 0x73
export const HDLC_DISC = 0x53
/** First information frame after UA (N(S)=0, N(R)=0 style I-frame). */
export const HDLC_I_FRAME_FIRST = 0x10

function buildHdlcFrameParts(params: {
  serverLogical: number
  clientLogical: number
  control: number
  payload: Uint8Array
}): Uint8Array {
  const prim = new Uint8Array([encodeHdlcAddress1Byte(params.serverLogical)])
  const sec = new Uint8Array([encodeHdlcAddress1Byte(params.clientLogical)])
  const len1 = params.payload.length
  const lengthByte = len1 === 0 ? 5 + sec.length + prim.length : 7 + sec.length + prim.length + len1

  const header: number[] = [FLAG, 0xa0, lengthByte]
  for (let i = 0; i < prim.length; i++) header.push(prim[i])
  for (let i = 0; i < sec.length; i++) header.push(sec[i])
  header.push(params.control)

  const h1 = new Uint8Array(header)
  const crc1 = countFcs16(h1, 1, h1.length - 1)
  const after1: number[] = [...header, crc1 & 0xff, (crc1 >> 8) & 0xff]

  if (len1 === 0) {
    after1.push(FLAG)
    return new Uint8Array(after1)
  }

  for (let i = 0; i < params.payload.length; i++) after1.push(params.payload[i])
  const h2 = new Uint8Array(after1)
  const crc2 = countFcs16(h2, 1, h2.length - 1)
  after1.push(crc2 & 0xff, (crc2 >> 8) & 0xff)
  after1.push(FLAG)
  return new Uint8Array(after1)
}

export function buildSnrmFrame(serverLogical: number, clientLogical: number): Buffer {
  return Buffer.from(
    buildHdlcFrameParts({
      serverLogical,
      clientLogical,
      control: HDLC_SNRM,
      payload: new Uint8Array(0),
    })
  )
}

export function buildDiscFrame(serverLogical: number, clientLogical: number): Buffer {
  return Buffer.from(
    buildHdlcFrameParts({
      serverLogical,
      clientLogical,
      control: HDLC_DISC,
      payload: new Uint8Array(0),
    })
  )
}

export function buildIframe(
  serverLogical: number,
  clientLogical: number,
  control: number,
  payload: Uint8Array
): Buffer {
  return Buffer.from(
    buildHdlcFrameParts({ serverLogical, clientLogical, control, payload })
  )
}

export type ParsedHdlcFrame =
  | {
      kind: "u"
      control: number
      format: number
      lengthByte: number
    }
  | {
      kind: "i"
      control: number
      format: number
      lengthByte: number
      llcAndApdu: Uint8Array
    }

/**
 * Parse one HDLC frame with trailing 0x7E; supports U-frame (no info) and I-frame (LLC+APDU).
 */
export function parseHdlcFrame(frame: Uint8Array): ParsedHdlcFrame | null {
  if (frame.length < 9 || frame[0] !== FLAG || frame[frame.length - 1] !== FLAG) {
    return null
  }
  const inner = frame.subarray(1, frame.length - 1)
  if (inner.length < 7) return null

  const format = inner[0]
  if ((format & 0xf0) !== 0xa0) return null

  const lengthByte = inner[1]
  const primLen = 1
  const secLen = 1
  const ctrlIdx = 2 + primLen + secLen
  if (inner.length < ctrlIdx + 1 + 2) return null

  const control = inner[ctrlIdx]
  const firstCrcIdx = ctrlIdx + 1
  const crcRead1 = inner[firstCrcIdx] | (inner[firstCrcIdx + 1] << 8)
  const crcCalc1 = countFcs16(inner, 0, firstCrcIdx)
  if (crcCalc1 !== crcRead1) return null

  const afterCrc1 = firstCrcIdx + 2
  if (afterCrc1 === inner.length) {
    return { kind: "u", control, format, lengthByte }
  }

  const secondPart = inner.subarray(afterCrc1)
  if (secondPart.length < 2) return null
  const crcRead2 =
    secondPart[secondPart.length - 2] | (secondPart[secondPart.length - 1] << 8)
  const dataPart = secondPart.subarray(0, secondPart.length - 2)
  const crcCalc2 = countFcs16(inner, 0, afterCrc1 + dataPart.length)
  if (crcCalc2 !== crcRead2) return null

  return {
    kind: "i",
    control,
    format,
    lengthByte,
    llcAndApdu: dataPart,
  }
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
