/**
 * HDLC header parse aligned with devtlco1/MVP-AMI `MeterClient._parse_ua_hdlc_header_addresses`:
 * - format byte (A0 family), length (optional multi-nibble high from fmt & 0x07)
 * - destination address field, then source address field: Gurux convention — field ends on a
 *   byte with LSB set (see MVP-AMI `_hdlc_next_address_raw`).
 * - control, HCS, optional information field + trailing FCS for I-frames.
 *
 * Parsed `dest` / `src` are the first and second on-wire address fields (same as
 * `parseHdlcFrameWithAddressWidths`), i.e. for a meter-originated UA typically dest=client,
 * src=meter.
 */

import { countFcs16 } from "@/lib/runtime/real/hdlc-fcs16"
import { fcs16MatchesWire } from "@/lib/runtime/real/hdlc-fcs-wire"
import type { ParsedHdlcVariable } from "@/lib/runtime/real/hdlc-frame-variable"

const FLAG = 0x7e

export type GuruxEaFrameDiagnostics = {
  accepted: boolean
  rejectReason: string | null
  formatByte: number | null
  frameLengthFromHeader: number | null
  lengthBytesHex: string | null
  destHex: string | null
  srcHex: string | null
  learnedMeterAddressHex: string | null
  controlInnerIndex: number | null
  controlHex: string | null
  headerFcsCalcHex: string | null
  headerFcsWireHex: string | null
  headerFcsEndian: "le" | "be" | null
  frameKind: "u" | "i" | "incomplete" | null
  payloadFcsCalcHex: string | null
  payloadFcsWireHex: string | null
  payloadFcsEndian: "le" | "be" | null
}

function emptyDiag(partial: Partial<GuruxEaFrameDiagnostics> = {}): GuruxEaFrameDiagnostics {
  return {
    accepted: false,
    rejectReason: null,
    formatByte: null,
    frameLengthFromHeader: null,
    lengthBytesHex: null,
    destHex: null,
    srcHex: null,
    learnedMeterAddressHex: null,
    controlInnerIndex: null,
    controlHex: null,
    headerFcsCalcHex: null,
    headerFcsWireHex: null,
    headerFcsEndian: null,
    frameKind: null,
    payloadFcsCalcHex: null,
    payloadFcsWireHex: null,
    payloadFcsEndian: null,
    ...partial,
  }
}

/** Gurux / MVP-AMI: one HDLC address field; last byte has LSB = 1. */
export function readHdlcAddressFieldGurux(
  inner: Uint8Array,
  pos: number
): { field: Uint8Array; next: number } | null {
  if (pos >= inner.length) return null
  const start = pos
  while (pos < inner.length) {
    const b = inner[pos]
    pos += 1
    if (b & 1) {
      return { field: inner.subarray(start, pos), next: pos }
    }
  }
  return null
}

export function parseHdlcFrameGuruxEa(
  frame: Uint8Array
): { parsed: ParsedHdlcVariable; diag: GuruxEaFrameDiagnostics } | null {
  const r = parseHdlcFrameGuruxEaWithDiagnostics(frame)
  return r.accepted && r.parsed ? { parsed: r.parsed, diag: r.diag } : null
}

export type GuruxEaParseResult = {
  accepted: boolean
  parsed: ParsedHdlcVariable | null
  diag: GuruxEaFrameDiagnostics
}

/**
 * Strict parse: both address fields (Gurux EA), HCS must match (LE or BE wire order),
 * and if octets remain after HCS, full I-frame second FCS must match.
 */
export function parseHdlcFrameGuruxEaWithDiagnostics(frame: Uint8Array): GuruxEaParseResult {
  if (frame.length < 14 || frame[0] !== FLAG || frame[frame.length - 1] !== FLAG) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({ rejectReason: "missing_flags_or_too_short" }),
    }
  }

  const inner = frame.subarray(1, frame.length - 1)
  if (inner.length < 6) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({ rejectReason: "inner_too_short" }),
    }
  }

  let pos = 0
  const formatByte = inner[pos++]
  if ((formatByte & 0xf0) !== 0xa0) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({ rejectReason: "format_not_A0_family", formatByte }),
    }
  }

  let frameLen = 0
  if ((formatByte & 0x07) !== 0) {
    frameLen = (formatByte & 0x07) << 8
  }
  if (pos >= inner.length) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({ formatByte, rejectReason: "truncated_after_format" }),
    }
  }
  const lenByte = inner[pos]
  const lengthBytesHex = Buffer.from(inner.subarray(0, pos + 1)).toString("hex")
  frameLen += lenByte
  pos += 1

  const destRd = readHdlcAddressFieldGurux(inner, pos)
  if (!destRd || destRd.field.length === 0) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        rejectReason: "destination_address_incomplete",
      }),
    }
  }
  const dest = destRd.field
  pos = destRd.next

  const srcRd = readHdlcAddressFieldGurux(inner, pos)
  if (!srcRd || srcRd.field.length === 0) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        destHex: Buffer.from(dest).toString("hex"),
        rejectReason: "source_address_incomplete",
      }),
    }
  }
  const src = srcRd.field
  pos = srcRd.next

  const controlInnerIndex = pos
  if (pos + 2 >= inner.length) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        destHex: Buffer.from(dest).toString("hex"),
        srcHex: Buffer.from(src).toString("hex"),
        controlInnerIndex,
        rejectReason: "truncated_before_or_at_hcs",
      }),
    }
  }

  const control = inner[pos]
  const firstCrcIdx = pos + 1
  const b0 = inner[firstCrcIdx]
  const b1 = inner[firstCrcIdx + 1]
  const headerFcsWireHex = Buffer.from([b0, b1]).toString("hex")
  const crcCalc = countFcs16(inner, 0, firstCrcIdx)
  const headerEndian = fcs16MatchesWire(crcCalc, b0, b1)
  const headerFcsCalcHex = crcCalc.toString(16)

  if (!headerEndian) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        destHex: Buffer.from(dest).toString("hex"),
        srcHex: Buffer.from(src).toString("hex"),
        learnedMeterAddressHex: Buffer.from(src).toString("hex"),
        controlInnerIndex,
        controlHex: control.toString(16).padStart(2, "0"),
        headerFcsCalcHex,
        headerFcsWireHex,
        headerFcsEndian: null,
        frameKind: null,
        rejectReason: "header_fcs_mismatch_le_and_be",
      }),
    }
  }

  const afterCrc1 = firstCrcIdx + 2
  if (afterCrc1 === inner.length) {
    const parsed: ParsedHdlcVariable = { kind: "u", control, dest, src }
    return {
      accepted: true,
      parsed,
      diag: {
        accepted: true,
        rejectReason: null,
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        destHex: Buffer.from(dest).toString("hex"),
        srcHex: Buffer.from(src).toString("hex"),
        learnedMeterAddressHex: Buffer.from(src).toString("hex"),
        controlInnerIndex,
        controlHex: control.toString(16).padStart(2, "0"),
        headerFcsCalcHex,
        headerFcsWireHex,
        headerFcsEndian: headerEndian,
        frameKind: "u",
        payloadFcsCalcHex: null,
        payloadFcsWireHex: null,
        payloadFcsEndian: null,
      },
    }
  }

  const secondPart = inner.subarray(afterCrc1)
  if (secondPart.length < 2) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        destHex: Buffer.from(dest).toString("hex"),
        srcHex: Buffer.from(src).toString("hex"),
        learnedMeterAddressHex: Buffer.from(src).toString("hex"),
        controlInnerIndex,
        controlHex: control.toString(16).padStart(2, "0"),
        headerFcsCalcHex,
        headerFcsWireHex,
        headerFcsEndian: headerEndian,
        frameKind: "incomplete",
        rejectReason: "payload_truncated_before_trailer_fcs",
      }),
    }
  }

  const p0 = secondPart[secondPart.length - 2]
  const p1 = secondPart[secondPart.length - 1]
  const payloadFcsWireHex = Buffer.from([p0, p1]).toString("hex")
  const dataPart = secondPart.subarray(0, secondPart.length - 2)
  const crc2Calc = countFcs16(inner, 0, afterCrc1 + dataPart.length)
  const payloadEndian = fcs16MatchesWire(crc2Calc, p0, p1)
  const payloadFcsCalcHex = crc2Calc.toString(16)

  if (!payloadEndian) {
    return {
      accepted: false,
      parsed: null,
      diag: emptyDiag({
        formatByte,
        frameLengthFromHeader: frameLen,
        lengthBytesHex,
        destHex: Buffer.from(dest).toString("hex"),
        srcHex: Buffer.from(src).toString("hex"),
        learnedMeterAddressHex: Buffer.from(src).toString("hex"),
        controlInnerIndex,
        controlHex: control.toString(16).padStart(2, "0"),
        headerFcsCalcHex,
        headerFcsWireHex,
        headerFcsEndian: headerEndian,
        frameKind: "i",
        payloadFcsCalcHex,
        payloadFcsWireHex,
        payloadFcsEndian: null,
        rejectReason: "payload_fcs_mismatch_le_and_be",
      }),
    }
  }

  const parsed: ParsedHdlcVariable = {
    kind: "i",
    control,
    dest,
    src,
    llcAndApdu: dataPart,
  }

  return {
    accepted: true,
    parsed,
    diag: {
      accepted: true,
      rejectReason: null,
      formatByte,
      frameLengthFromHeader: frameLen,
      lengthBytesHex,
      destHex: Buffer.from(dest).toString("hex"),
      srcHex: Buffer.from(src).toString("hex"),
      learnedMeterAddressHex: Buffer.from(src).toString("hex"),
      controlInnerIndex,
      controlHex: control.toString(16).padStart(2, "0"),
      headerFcsCalcHex,
      headerFcsWireHex,
      headerFcsEndian: headerEndian,
      frameKind: "i",
      payloadFcsCalcHex,
      payloadFcsWireHex,
      payloadFcsEndian: payloadEndian,
    },
  }
}
