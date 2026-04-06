/**
 * Search meter accumulation for a verifiable AARE (association response) inside HDLC I-frames.
 * Used by inbound DLMS session and ingress protocol trace (post-AARQ diagnostics).
 */

import {
  enumerateAllValidHdlcParses,
} from "@/lib/runtime/real/hdlc-frame-inspect"
import {
  listLlcStripVariantsForMeterReply,
  parseAareAssociationResult,
} from "@/lib/runtime/real/dlms-apdu"
import { splitHdlcFrames } from "@/lib/runtime/real/hdlc-frame-variable"

export type AareSearchFrameRow = {
  frameHexCapped: string
  addressModel: string
  destLen: number
  srcLen: number
  controlLabel: string
  payloadByteLength: number
  llcStripped: "reply_e6e700" | "send_e6e600" | "raw"
  apduPrefixHex: string
  hasTag61: boolean
  associationResultEnum: number | null
  rowNote: string
}

export type AareSearchReport = {
  completeHdlcFrameCount: number
  iFrameVariantCount: number
  rows: AareSearchFrameRow[]
  /** Single-line operator summary */
  summary: string
  /** Machine-oriented code for ingress trace */
  code:
    | "no_7e_segments"
    | "segments_but_no_i_parse"
    | "i_parsed_no_tag_61"
    | "tag_61_no_a2_enum"
    | "association_rejected"
    | "association_accepted"
}

const MAX_FRAME_HEX = 400
const APDU_PREFIX = 24

function capFrameHex(raw: Uint8Array): string {
  const h = Buffer.from(raw).toString("hex")
  return h.length <= MAX_FRAME_HEX ? h : `${h.slice(0, MAX_FRAME_HEX)}…`
}

function hasTag61(apdu: Uint8Array): boolean {
  for (let i = 0; i < apdu.length; i++) {
    if (apdu[i] === 0x61) return true
  }
  return false
}

/**
 * First AARE with parsed association-result (any LLC strip variant). Null if none.
 */
export function findAareInMeterAccum(accum: Uint8Array): { result: number; apdu: Buffer } | null {
  for (const raw of splitHdlcFrames(accum)) {
    for (const v of enumerateAllValidHdlcParses(raw)) {
      if (v.parsed.kind !== "i") continue
      for (const { apdu } of listLlcStripVariantsForMeterReply(v.parsed.llcAndApdu)) {
        const hit = parseAareAssociationResult(apdu)
        if (hit) return { result: hit.result, apdu: Buffer.from(apdu) }
      }
    }
  }
  return null
}

/**
 * Bounded scan for ingress diagnostics after AARQ.
 */
export function buildAareSearchReport(accum: Uint8Array, opts?: { maxRows?: number }): AareSearchReport {
  const maxRows = opts?.maxRows ?? 12
  const frames = splitHdlcFrames(accum)
  const rows: AareSearchFrameRow[] = []

  if (frames.length === 0) {
    return {
      completeHdlcFrameCount: 0,
      iFrameVariantCount: 0,
      rows: [],
      summary: "no_complete_7e_to_7e_segments_in_accum",
      code: "no_7e_segments",
    }
  }

  let iFrameVariantCount = 0
  for (const raw of frames) {
    if (rows.length >= maxRows) break
    for (const v of enumerateAllValidHdlcParses(raw)) {
      if (v.parsed.kind !== "i") continue
      iFrameVariantCount += 1
      if (rows.length >= maxRows) break

      const payload = v.parsed.llcAndApdu
      let best: AareSearchFrameRow | null = null

      for (const { apdu, strip } of listLlcStripVariantsForMeterReply(payload)) {
        const t61 = hasTag61(apdu)
        const hit = parseAareAssociationResult(apdu)
        const prefix = Buffer.from(apdu.subarray(0, Math.min(APDU_PREFIX, apdu.length))).toString("hex")
        let rowNote = ""
        if (hit) {
          rowNote = `parsed_association_result=${hit.result}`
        } else if (t61) {
          rowNote = "tag_61_present_no_a2_02_01_enum_match"
        } else {
          rowNote = "no_tag_61_in_apdu_variant"
        }

        const row: AareSearchFrameRow = {
          frameHexCapped: capFrameHex(raw),
          addressModel: v.addressModel,
          destLen: v.destLen,
          srcLen: v.srcLen,
          controlLabel: "I_frame",
          payloadByteLength: payload.length,
          llcStripped: strip,
          apduPrefixHex: prefix,
          hasTag61: t61,
          associationResultEnum: hit ? hit.result : null,
          rowNote,
        }
        best = row
        if (hit) break
      }

      if (best) rows.push(best)
    }
  }

  if (iFrameVariantCount === 0) {
    return {
      completeHdlcFrameCount: frames.length,
      iFrameVariantCount: 0,
      rows,
      summary: `${frames.length}_hdlc_segment(s)_no_valid_I_frame_FCS_parse`,
      code: "segments_but_no_i_parse",
    }
  }

  const accepted = rows.find((r) => r.associationResultEnum === 0)
  if (accepted) {
    return {
      completeHdlcFrameCount: frames.length,
      iFrameVariantCount,
      rows,
      summary: "association_result_0_accepted_on_wire",
      code: "association_accepted",
    }
  }

  const rejected = rows.find((r) => r.associationResultEnum !== null && r.associationResultEnum !== 0)
  if (rejected) {
    return {
      completeHdlcFrameCount: frames.length,
      iFrameVariantCount,
      rows,
      summary: `association_rejected_enum_${rejected.associationResultEnum}`,
      code: "association_rejected",
    }
  }

  const any61 = rows.some((r) => r.hasTag61)
  if (!any61) {
    return {
      completeHdlcFrameCount: frames.length,
      iFrameVariantCount,
      rows,
      summary: "I_frame(s)_parsed_no_AARE_tag_0x61_in_apdu_variants",
      code: "i_parsed_no_tag_61",
    }
  }

  return {
    completeHdlcFrameCount: frames.length,
    iFrameVariantCount,
    rows,
    summary: "tag_0x61_seen_but_association-result_TLV_not_matched",
    code: "tag_61_no_a2_enum",
  }
}
