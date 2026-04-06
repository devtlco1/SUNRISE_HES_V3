import {
  parseHdlcFrameGuruxEa,
  parseHdlcFrameGuruxEaWithDiagnostics,
  type GuruxEaFrameDiagnostics,
} from "@/lib/runtime/real/hdlc-frame-gurux-ea"
import {
  HDLC_DISC,
  HDLC_SNRM,
  HDLC_UA,
  parseHdlcFrameWithAddressWidths,
  splitHdlcFrames,
  type ParsedHdlcVariable,
} from "@/lib/runtime/real/hdlc-frame-variable"

const FLAG = 0x7e

export function capHex(hex: string, maxChars: number): string {
  return hex.length <= maxChars ? hex : `${hex.slice(0, maxChars)}…`
}

export type HdlcParseVariant = {
  destLen: number
  srcLen: number
  parsed: ParsedHdlcVariable
  addressModel: "fixed_width" | "gurux_ea"
}

/** Enumerate all (dest,src) in 1..8 that yield a valid FCS-backed parse (bounded brute force). */
export function enumerateValidHdlcParses(frame: Uint8Array): HdlcParseVariant[] {
  const out: HdlcParseVariant[] = []
  const seen = new Set<string>()
  for (let d = 1; d <= 8; d++) {
    for (let s = 1; s <= 8; s++) {
      const p = parseHdlcFrameWithAddressWidths(frame, d, s)
      if (!p) continue
      const k = `${d},${s},${p.kind},${p.control}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ destLen: d, srcLen: s, parsed: p, addressModel: "fixed_width" })
    }
  }
  return out
}

/**
 * Gurux EA parse (MVP-AMI address model) first, then fixed-width enumeration.
 * Use this when searching for AARE / GET in meter traffic with variable HDLC addresses.
 */
export function enumerateAllValidHdlcParses(frame: Uint8Array): HdlcParseVariant[] {
  const out: HdlcParseVariant[] = []
  const seen = new Set<string>()
  const ea = parseHdlcFrameGuruxEa(frame)
  if (ea) {
    const p = ea.parsed
    const k = `ea|${p.kind}|${p.control}|${Buffer.from(p.dest).toString("hex")}|${Buffer.from(p.src).toString("hex")}`
    seen.add(k)
    out.push({
      destLen: p.dest.length,
      srcLen: p.src.length,
      parsed: p,
      addressModel: "gurux_ea",
    })
  }
  for (const v of enumerateValidHdlcParses(frame)) {
    const p = v.parsed
    const k = `fw|${v.destLen}|${v.srcLen}|${p.kind}|${p.control}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

export function classifyHdlcControl(control: number): string {
  if (control === HDLC_UA) return "UA"
  if (control === HDLC_SNRM) return "SNRM"
  if (control === HDLC_DISC) return "DISC"
  if ((control & 0x01) === 0 && (control & 0x10) === 0x10) return "I_frame"
  if ((control & 0x03) === 0x01 || (control & 0x03) === 0x05) return "S_frame"
  return `U_or_other_0x${control.toString(16)}`
}

export type FrameInspectVariantRow = {
  destLen: number
  srcLen: number
  kind: string
  control: number
  controlLabel: string
  destHex: string
  srcHex: string
  fcsValid: "header_and_payload" | "header_only" | "failed"
  addressModel: "fixed_width" | "gurux_ea"
  headerFcsEndian?: "le" | "be"
  payloadFcsEndian?: "le" | "be"
}

export type FrameInspectRecord = {
  frameHex: string
  byteLength: number
  formatByte: number | null
  formatNote: string
  lengthByte: number | null
  variants: FrameInspectVariantRow[]
  heuristicUaByteOffsetsInInner: number[]
  summary: string
  /** MVP-AMI–style Gurux EA parse attempt (always present when inner exists). */
  eaGurux: GuruxEaFrameDiagnostics | null
}

function innerWithoutFlags(frame: Uint8Array): Uint8Array | null {
  if (frame.length < 2 || frame[0] !== FLAG || frame[frame.length - 1] !== FLAG) return null
  return frame.subarray(1, frame.length - 1)
}

/** Offsets in inner (0-based) where byte equals 0x73 — diagnostics only, not proof of UA. */
function findHeuristicUaOffsets(inner: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === HDLC_UA) out.push(i)
  }
  return out.slice(0, 16)
}

function variantRowFromParsed(
  p: ParsedHdlcVariable,
  destLen: number,
  srcLen: number,
  model: "fixed_width" | "gurux_ea",
  endian?: { header: "le" | "be"; payload?: "le" | "be" }
): FrameInspectVariantRow {
  const fcsValid: FrameInspectVariantRow["fcsValid"] =
    p.kind === "u" ? "header_only" : "header_and_payload"
  return {
    destLen,
    srcLen,
    kind: p.kind,
    control: p.control,
    controlLabel: classifyHdlcControl(p.control),
    destHex: Buffer.from(p.dest).toString("hex"),
    srcHex: Buffer.from(p.src).toString("hex"),
    fcsValid,
    addressModel: model,
    headerFcsEndian: endian?.header,
    payloadFcsEndian: endian?.payload,
  }
}

/**
 * Full inspection of one 0x7E…0x7E segment for logging. Does not claim protocol success.
 */
export function inspectHdlcFrameSegment(frame: Uint8Array): FrameInspectRecord {
  const frameHex = Buffer.from(frame).toString("hex")
  const inner = innerWithoutFlags(frame)
  if (!inner) {
    return {
      frameHex: capHex(frameHex, 2048),
      byteLength: frame.length,
      formatByte: null,
      formatNote: "missing_open_or_close_flag",
      lengthByte: null,
      variants: [],
      heuristicUaByteOffsetsInInner: [],
      summary: "incomplete_frame_or_no_flags",
      eaGurux: null,
    }
  }

  const eaFull = parseHdlcFrameGuruxEaWithDiagnostics(frame)
  const eaDiag = eaFull.diag

  const formatByte = inner[0]
  const lengthByte = inner.length > 1 ? inner[1] : null
  let formatNote = "ok_a0_family"
  if ((formatByte & 0xf0) !== 0xa0) {
    formatNote = `unexpected_format_0x${formatByte.toString(16)}_not_A0xx`
  }

  const variants: FrameInspectVariantRow[] = []
  if (eaFull.accepted && eaFull.parsed) {
    const p = eaFull.parsed
    variants.push(
      variantRowFromParsed(p, p.dest.length, p.src.length, "gurux_ea", {
        header: eaDiag.headerFcsEndian!,
        payload: eaDiag.payloadFcsEndian ?? undefined,
      })
    )
  }

  for (const v of enumerateValidHdlcParses(frame)) {
    variants.push(variantRowFromParsed(v.parsed, v.destLen, v.srcLen, "fixed_width"))
  }

  const uaStrict = variants.filter((x) => x.controlLabel === "UA")
  const summaryParts: string[] = []
  if (eaDiag.accepted) {
    summaryParts.push(`gurux_EA_accepted_${eaDiag.frameKind ?? "?"}_ctrl_0x${eaDiag.controlHex ?? ""}`)
    if (eaDiag.headerFcsEndian) {
      summaryParts.push(`header_fcs_wire_${eaDiag.headerFcsEndian}`)
    }
    if (eaDiag.payloadFcsEndian) {
      summaryParts.push(`payload_fcs_wire_${eaDiag.payloadFcsEndian}`)
    }
    if (eaDiag.learnedMeterAddressHex) {
      summaryParts.push(`learned_meter_src_${eaDiag.learnedMeterAddressHex}`)
    }
  } else if (eaDiag.rejectReason) {
    summaryParts.push(`gurux_EA_rejected_${eaDiag.rejectReason}`)
  }

  const fixedOnly = variants.filter((v) => v.addressModel === "fixed_width")
  if (fixedOnly.length === 0) summaryParts.push("no_valid_fixed_width_fcs_parse_dest_src_1_to_8")
  else summaryParts.push(`${fixedOnly.length}_fixed_width_variant(s)`)

  if (uaStrict.length > 0) {
    summaryParts.push(`${uaStrict.length}_strict_UA_control_0x73_FCS_ok`)
  } else summaryParts.push("no_strict_UA_FCS_ok")

  return {
    frameHex: capHex(frameHex, 2048),
    byteLength: frame.length,
    formatByte,
    formatNote,
    lengthByte,
    variants,
    heuristicUaByteOffsetsInInner: findHeuristicUaOffsets(inner),
    summary: summaryParts.join("; "),
    eaGurux: eaDiag,
  }
}

/**
 * True only if a UA response exists with valid FCS under a grounded parse (Gurux EA or fixed width).
 * UA may carry an information field after HCS; that layout parses as `kind: "i"` while control stays 0x73.
 */
export function hasStrictUaFrame(buffer: Uint8Array): boolean {
  for (const raw of splitHdlcFrames(buffer)) {
    const ea = parseHdlcFrameGuruxEa(raw)
    if (ea && ea.parsed.control === HDLC_UA) return true
    for (const v of enumerateValidHdlcParses(raw)) {
      if (v.parsed.control === HDLC_UA) return true
    }
  }
  return false
}

export function findFirstStrictSnrmVariant(buffer: Uint8Array): HdlcParseVariant | null {
  for (const raw of splitHdlcFrames(buffer)) {
    const ea = parseHdlcFrameGuruxEa(raw)
    if (ea && ea.parsed.control === HDLC_SNRM) {
      const p = ea.parsed
      return {
        destLen: p.dest.length,
        srcLen: p.src.length,
        parsed: p,
        addressModel: "gurux_ea",
      }
    }
    for (const v of enumerateValidHdlcParses(raw)) {
      if (v.parsed.control === HDLC_SNRM) return v
    }
  }
  return null
}

export function findFirstStrictUaVariant(buffer: Uint8Array): HdlcParseVariant | null {
  for (const raw of splitHdlcFrames(buffer)) {
    const ea = parseHdlcFrameGuruxEa(raw)
    if (ea && ea.parsed.control === HDLC_UA) {
      const p = ea.parsed
      return {
        destLen: p.dest.length,
        srcLen: p.src.length,
        parsed: p,
        addressModel: "gurux_ea",
      }
    }
    for (const v of enumerateValidHdlcParses(raw)) {
      if (v.parsed.control === HDLC_UA) return v
    }
  }
  return null
}

export type { GuruxEaFrameDiagnostics }
