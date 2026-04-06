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
      out.push({ destLen: d, srcLen: s, parsed: p })
    }
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

export type FrameInspectRecord = {
  frameHex: string
  byteLength: number
  formatByte: number | null
  formatNote: string
  lengthByte: number | null
  variants: Array<{
    destLen: number
    srcLen: number
    kind: string
    control: number
    controlLabel: string
    destHex: string
    srcHex: string
    fcsValid: "header_and_payload" | "header_only" | "failed"
  }>
  heuristicUaByteOffsetsInInner: number[]
  summary: string
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
    }
  }

  const formatByte = inner[0]
  const lengthByte = inner.length > 1 ? inner[1] : null
  let formatNote = "ok_a0_family"
  if ((formatByte & 0xf0) !== 0xa0) {
    formatNote = `unexpected_format_0x${formatByte.toString(16)}_not_A0xx`
  }

  const variants = enumerateValidHdlcParses(frame).map((v) => {
    const p = v.parsed
    const fcsValid: FrameInspectRecord["variants"][0]["fcsValid"] =
      p.kind === "u" ? "header_only" : "header_and_payload"
    return {
      destLen: v.destLen,
      srcLen: v.srcLen,
      kind: p.kind,
      control: p.control,
      controlLabel: classifyHdlcControl(p.control),
      destHex: Buffer.from(p.dest).toString("hex"),
      srcHex: Buffer.from(p.src).toString("hex"),
      fcsValid,
    }
  })

  const uaStrict = variants.filter(
    (x) => x.kind === "u" && x.control === HDLC_UA
  )
  const summaryParts: string[] = []
  if (variants.length === 0) summaryParts.push("no_valid_fcs_parse_for_dest_src_1_to_8")
  else summaryParts.push(`${variants.length}_valid_parse_variant(s)`)
  if (uaStrict.length > 0) summaryParts.push(`${uaStrict.length}_UA_U_frame_FCS_ok`)
  else summaryParts.push("no_UA_U_frame_with_valid_fcs")

  return {
    frameHex: capHex(frameHex, 2048),
    byteLength: frame.length,
    formatByte,
    formatNote,
    lengthByte,
    variants,
    heuristicUaByteOffsetsInInner: findHeuristicUaOffsets(inner),
    summary: summaryParts.join("; "),
  }
}

/** True only if a complete HDLC U-frame with UA and passing FCS exists for some address widths. */
export function hasStrictUaFrame(buffer: Uint8Array): boolean {
  for (const raw of splitHdlcFrames(buffer)) {
    for (const v of enumerateValidHdlcParses(raw)) {
      if (v.parsed.kind === "u" && v.parsed.control === HDLC_UA) return true
    }
  }
  return false
}

export function findFirstStrictSnrmVariant(buffer: Uint8Array): HdlcParseVariant | null {
  for (const raw of splitHdlcFrames(buffer)) {
    for (const v of enumerateValidHdlcParses(raw)) {
      if (v.parsed.kind === "u" && v.parsed.control === HDLC_SNRM) return v
    }
  }
  return null
}

export function findFirstStrictUaVariant(buffer: Uint8Array): HdlcParseVariant | null {
  for (const raw of splitHdlcFrames(buffer)) {
    for (const v of enumerateValidHdlcParses(raw)) {
      if (v.parsed.kind === "u" && v.parsed.control === HDLC_UA) return v
    }
  }
  return null
}
