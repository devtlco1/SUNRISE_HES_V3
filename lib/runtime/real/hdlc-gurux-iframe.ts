/**
 * Client HDLC I-frame construction aligned with Gurux `GXDLMS.getHdlcFrame` for HDLC:
 * - `maxInfoTX` caps each segment (first segment uses `maxInfoTX - 3` like Gurux when data starts at position 0).
 * - Format `0xA0` vs `0xA8` when another segment follows.
 * - I-frame control from `clientIframeControlFirstSend` / `clientIframeControlAdvanceSend` (matches `getNextSend`).
 */

import {
  clientIframeControlAdvanceSend,
  clientIframeControlFirstSend,
  type ClientHdlcIframeSeqState,
} from "@/lib/runtime/real/hdlc-client-sequence"
import { countFcs16 } from "@/lib/runtime/real/hdlc-fcs16"

const FLAG = 0x7e

export type GuruxOutboundIframeBuildDiag = {
  segmentCount: number
  /** I-frame control octets per segment (hex). */
  controlsHex: string[]
  formatBytesHex: string[]
  lengthBytes: number[]
  payloadBytesPerSegment: number[]
  maxInfoTXInput: number
  multiSegment: boolean
  builderId: "gurux_getHdlcFrame_style"
}

function pushLe16(out: number[], crc: number): void {
  out.push(crc & 0xff, (crc >> 8) & 0xff)
}

/**
 * Build one or more complete HDLC frames (7E…7E) carrying `payload` (typically LLC + APDU).
 */
export function buildGuruxStyleClientHdlcIFrames(params: {
  serverAddress: Uint8Array
  clientAddress: Uint8Array
  payload: Uint8Array
  maxInfoTX: number
  seq: ClientHdlcIframeSeqState
}): { frames: Buffer[]; diag: GuruxOutboundIframeBuildDiag } {
  const primary = params.serverAddress
  const secondary = params.clientAddress
  const payload = params.payload
  const maxInfoTX = Math.max(32, Math.min(params.maxInfoTX, 0xffff))

  const frames: Buffer[] = []
  const controlsHex: string[] = []
  const formatBytesHex: string[] = []
  const lengthBytes: number[] = []
  const payloadBytesPerSegment: number[] = []

  let pos = 0
  let isFirstClientIframe = true

  while (pos < payload.length) {
    let frameSize = maxInfoTX
    if (pos === 0) frameSize -= 3
    if (frameSize < 16) frameSize = 16

    const remaining = payload.length - pos
    const len1 = Math.min(remaining, frameSize)
    const moreFollows = pos + len1 < payload.length

    const control = isFirstClientIframe
      ? clientIframeControlFirstSend(params.seq)
      : clientIframeControlAdvanceSend(params.seq)
    isFirstClientIframe = false

    const chunk = payload.subarray(pos, pos + len1)
    const addrPayloadSum = secondary.length + primary.length + len1
    const formatByte = (moreFollows ? 0xa8 : 0xa0) | ((addrPayloadSum >> 8) & 0x7)
    const lengthByte = 7 + secondary.length + primary.length + len1

    const header: number[] = [FLAG, formatByte, lengthByte]
    for (let i = 0; i < primary.length; i++) header.push(primary[i]!)
    for (let i = 0; i < secondary.length; i++) header.push(secondary[i]!)
    header.push(control)

    const h1 = new Uint8Array(header)
    const crc1 = countFcs16(h1, 1, h1.length - 1)
    const after1: number[] = [...header]
    pushLe16(after1, crc1)
    for (let i = 0; i < chunk.length; i++) after1.push(chunk[i]!)

    const h2 = new Uint8Array(after1)
    const crc2 = countFcs16(h2, 1, h2.length - 1)
    pushLe16(after1, crc2)
    after1.push(FLAG)

    frames.push(Buffer.from(after1))
    controlsHex.push(control.toString(16).padStart(2, "0"))
    formatBytesHex.push(formatByte.toString(16).padStart(2, "0"))
    lengthBytes.push(lengthByte)
    payloadBytesPerSegment.push(len1)

    pos += len1
  }

  const diag: GuruxOutboundIframeBuildDiag = {
    segmentCount: frames.length,
    controlsHex,
    formatBytesHex,
    lengthBytes,
    payloadBytesPerSegment,
    maxInfoTXInput: maxInfoTX,
    multiSegment: frames.length > 1,
    builderId: "gurux_getHdlcFrame_style",
  }

  return { frames, diag }
}

/** Next I-frame control after the last segment built by `buildGuruxStyleClientHdlcIFrames` (e.g. identity GET). */
export function nextClientIframeControlAfterSegments(seq: ClientHdlcIframeSeqState): number {
  return clientIframeControlAdvanceSend(seq)
}
