import { createHash, timingSafeEqual } from "node:crypto"

import {
  buildGuruxStyleLowLnCosemAarqApdu,
  GURUX_INITIAL_LN_PROPOSED_CONFORMANCE,
  type AarqInitiateWireOptions,
} from "@/lib/runtime/real/dlms-aarq-lls"
import { LLC_SEND } from "@/lib/runtime/real/dlms-apdu"

export type AarqBuilderKind = "LOW_LLS_LN" | "LN_MINIMAL_NO_AUTH"

/** Optional: compare built AARQ AC field to the runtime-configured password (MVP-AMI: UTF-8 → OCTET STRING in AC). */
export type OutboundAarqPasswordContext = {
  /** Plaintext from `RUNTIME_INGRESS_DLMS_PASSWORD` when LOW; null otherwise. */
  configuredPasswordUtf8: string | null
  /** Human-readable source label (env key or `N/A_*`). */
  configuredPasswordSourceLabel: string
}

/**
 * Developer-oriented breakdown of the LLC + COSEM AARQ payload (I-frame information field).
 * May include **plaintext password** and AC TLV hex — treat as secret; keep `/api/runtime/ingress/status` off untrusted networks.
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
  /** Same as transmitted password octet length when AC present; legacy field name. */
  passwordUtf8ByteLength: number | null
  /** Raw TLV for context [0] calling-authentication-value (tag AC…), or null if absent. */
  callingAuthenticationValueHex: string | null
  /** OCTET STRING payload only (password bytes on wire), hex. */
  transmittedPasswordOctetsHex: string | null
  /** Length of `transmittedPasswordOctetsHex` / 2 when present. */
  transmittedPasswordUtf8ByteLength: number | null
  /** UTF-8 round-trip of transmitted octets when valid; else null (binary / invalid UTF-8). */
  passwordWireAsUtf8: string | null
  /** Runtime source label for the configured secret (not proof of value until compared below). */
  configuredPasswordSourceLabel: string
  /** Plaintext password from runtime profile at send time (for controlled VPS proof). */
  configuredPasswordUtf8: string | null
  configuredPasswordUtf8ByteLength: number | null
  /** SHA-256 (hex) of configured UTF-8 password; empty string if none. */
  configuredPasswordSha256Hex: string
  /** True iff `Buffer.from(configured,'utf8')` equals transmitted octets (same length + timingSafeEqual). */
  configuredUtf8BytesMatchTransmittedOctets: boolean | null
  /** True when wire octets are valid UTF-8 and decode equals configured string. */
  configuredStringMatchesWireUtf8Decoding: boolean | null
  /** One-line outcome for operators. */
  passwordComparisonNote: string
  /**
   * MVP-AMI uses Gurux `parseUAResponse(ua_info)` before `aarqRequest()`; negotiated
   * max-PDU / window may differ from this static LN+LLS template.
   */
  mvpAmiAlignmentNote: string
  /**
   * Gurux `_GXAPDU.generateAarq` reference APDU (tag 60…) for LOW + LN with default initiate
   * (conformance `GURUX_INITIAL_LN_PROPOSED_CONFORMANCE`, max PDU 0xFFFF, DLMS version 6).
   * Built from the same password string as the outbound payload when builder is LOW_LLS_LN.
   */
  guruxReferenceCosemAarqApduHex: string | null
  /** True when `cosemAarqApduHex` equals `guruxReferenceCosemAarqApduHex`. */
  cosemAarqApduMatchesGuruxReference: boolean | null
  /** Operator-readable first difference or `match` / `n_a`. */
  aarqGuruxDiffSummary: string
  /** Short note on what UA parsing changes in Gurux (HDLC only for AARQ body). */
  guruxUaParseEffectNote: string
  /** Initiate-request shaping for LOW AARQ (`RUNTIME_INGRESS_DLMS_AARQ_*`); null when builder is not LOW. */
  aarqInitiateProfileLabel: string | null
  aarqInitiateMaxPduSize: number | null
  aarqInitiateProposedConformanceHex: string | null
  /** Reminder that this diagnostic can embed secrets. */
  secretsExposureNote: string
}

/** Snapshot of env-driven initiate options (mirrors `InboundAarqInitiateProfile`). */
export type OutboundAarqInitiateSnapshot = {
  profileLabel: string
  maxPduSize: number
  proposedConformance24: number
}

type ExtractedAuth = {
  callingAuthenticationValueHex: string | null
  transmittedOctets: Uint8Array | null
  passwordWireAsUtf8: string | null
}

/**
 * Find first AC (0xac) calling-authentication block; assumes short definite length on AC.
 * Matches MVP-AMI / Gurux LLS: AC wrapping OCTET STRING (tag 80) of password bytes (UTF-8 in typical stacks).
 */
function extractCallingAuthDiag(apdu: Uint8Array): ExtractedAuth {
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
          transmittedOctets: Uint8Array.from(oct),
          passwordWireAsUtf8: utf8,
        }
      }
    }
    return {
      callingAuthenticationValueHex: Buffer.from(block).toString("hex"),
      transmittedOctets: null,
      passwordWireAsUtf8: null,
    }
  }
  return {
    callingAuthenticationValueHex: null,
    transmittedOctets: null,
    passwordWireAsUtf8: null,
  }
}

function summarizeBinaryDiff(a: Uint8Array, b: Uint8Array): string {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `first_diff_offset_${i}_out_${a[i]!.toString(16).padStart(2, "0")}_ref_${b[i]!.toString(16).padStart(2, "0")}`
    }
  }
  if (a.length !== b.length) {
    return `prefix_equal_len_out_${a.length}_ref_${b.length}`
  }
  return "match"
}

function comparePasswords(
  auth: ExtractedAuth,
  ctx: OutboundAarqPasswordContext | undefined,
  builder: AarqBuilderKind
): Pick<
  OutboundAarqPayloadDiag,
  | "configuredPasswordSourceLabel"
  | "configuredPasswordUtf8"
  | "configuredPasswordUtf8ByteLength"
  | "configuredPasswordSha256Hex"
  | "configuredUtf8BytesMatchTransmittedOctets"
  | "configuredStringMatchesWireUtf8Decoding"
  | "passwordComparisonNote"
> {
  const label = ctx?.configuredPasswordSourceLabel ?? "not_provided_to_diagnostic"
  const configured = ctx?.configuredPasswordUtf8 ?? null
  const cfgLen = configured !== null ? Buffer.byteLength(configured, "utf8") : null
  const cfgSha =
    configured !== null && configured.length > 0
      ? createHash("sha256").update(configured, "utf8").digest("hex")
      : configured === ""
        ? createHash("sha256").update("", "utf8").digest("hex")
        : ""

  const oct = auth.transmittedOctets

  if (builder === "LN_MINIMAL_NO_AUTH") {
    const hasUnexpectedPw = oct !== null && oct.length > 0
    return {
      configuredPasswordSourceLabel: label,
      configuredPasswordUtf8: configured,
      configuredPasswordUtf8ByteLength: cfgLen,
      configuredPasswordSha256Hex: cfgSha,
      configuredUtf8BytesMatchTransmittedOctets: hasUnexpectedPw ? false : true,
      configuredStringMatchesWireUtf8Decoding: null,
      passwordComparisonNote: hasUnexpectedPw
        ? "unexpected_password_octets_in_AARQ_while_builder_is_NONE"
        : "auth_NONE_expected_no_password_in_AARQ",
    }
  }

  if (!oct || oct.length === 0) {
    return {
      configuredPasswordSourceLabel: label,
      configuredPasswordUtf8: configured,
      configuredPasswordUtf8ByteLength: cfgLen,
      configuredPasswordSha256Hex: cfgSha,
      configuredUtf8BytesMatchTransmittedOctets: null,
      configuredStringMatchesWireUtf8Decoding: null,
      passwordComparisonNote: "LOW_builder_but_no_AC_password_octets_extracted",
    }
  }

  const txHex = Buffer.from(oct).toString("hex")

  if (configured === null) {
    return {
      configuredPasswordSourceLabel: label,
      configuredPasswordUtf8: null,
      configuredPasswordUtf8ByteLength: null,
      configuredPasswordSha256Hex: "",
      configuredUtf8BytesMatchTransmittedOctets: null,
      configuredStringMatchesWireUtf8Decoding: null,
      passwordComparisonNote: `transmitted_password_octets_len_${oct.length}_hex_${txHex}_no_configured_secret_passed_to_diag`,
    }
  }

  const cfgBuf = Buffer.from(configured, "utf8")
  const octBuf = Buffer.from(oct)
  const bytesMatch = cfgBuf.length === octBuf.length && timingSafeEqual(cfgBuf, octBuf)
  const strMatch = auth.passwordWireAsUtf8 !== null && auth.passwordWireAsUtf8 === configured

  const note = bytesMatch
    ? "configured_utf8_bytes_MATCH_transmitted_AC_octets"
    : auth.passwordWireAsUtf8 === null
      ? `MISMATCH_or_non_utf8_wire_compare_fields_lengths_cfg_${cfgBuf.length}_tx_${oct.length}`
      : `MISMATCH_compare_fields_configuredPasswordUtf8_passwordWireAsUtf8_transmittedPasswordOctetsHex_lengths_cfg_${cfgBuf.length}_tx_${oct.length}`

  return {
    configuredPasswordSourceLabel: label,
    configuredPasswordUtf8: configured,
    configuredPasswordUtf8ByteLength: cfgLen,
    configuredPasswordSha256Hex: cfgSha,
    configuredUtf8BytesMatchTransmittedOctets: bytesMatch,
    configuredStringMatchesWireUtf8Decoding: strMatch,
    passwordComparisonNote: note,
  }
}

/** Describe LLC + AARQ bytes (logical LLC+APDU inside the HDLC information field). */
export function describeOutboundAarqPayload(
  llcPlusApdu: Uint8Array,
  builder: AarqBuilderKind,
  passwordCtx?: OutboundAarqPasswordContext,
  initiateSnapshot?: OutboundAarqInitiateSnapshot
): OutboundAarqPayloadDiag {
  const expectedLlcSendHex = Buffer.from(LLC_SEND).toString("hex")
  const llcHex = Buffer.from(llcPlusApdu.subarray(0, Math.min(3, llcPlusApdu.length))).toString("hex")
  const rest = llcPlusApdu.length > 3 ? llcPlusApdu.subarray(3) : new Uint8Array(0)
  const auth = extractCallingAuthDiag(rest)
  const oct = auth.transmittedOctets
  const txLen = oct ? oct.length : null
  const txHex = oct ? Buffer.from(oct).toString("hex") : null

  const cmp = comparePasswords(auth, passwordCtx, builder)

  let guruxReferenceCosemAarqApduHex: string | null = null
  let cosemAarqApduMatchesGuruxReference: boolean | null = null
  let aarqGuruxDiffSummary = "n_a"
  let guruxUaParseEffectNote =
    "Gurux_parseUAResponse_updates_hdlc_maxInfo_window;_getHdlcFrame_segments_by_maxInfoTX;_getLnMessages_emits_one_or_more_frames."

  let aarqInitiateProfileLabel: string | null = null
  let aarqInitiateMaxPduSize: number | null = null
  let aarqInitiateProposedConformanceHex: string | null = null

  if (builder === "LOW_LLS_LN") {
    const pwd =
      passwordCtx?.configuredPasswordUtf8 ?? auth.passwordWireAsUtf8 ?? ""
    const wire: AarqInitiateWireOptions | undefined = initiateSnapshot
      ? {
          maxPduSize: initiateSnapshot.maxPduSize,
          proposedConformance24: initiateSnapshot.proposedConformance24,
        }
      : undefined
    const ref = buildGuruxStyleLowLnCosemAarqApdu(pwd, wire)
    guruxReferenceCosemAarqApduHex = Buffer.from(ref).toString("hex")
    cosemAarqApduMatchesGuruxReference = Buffer.from(rest).equals(Buffer.from(ref))
    aarqGuruxDiffSummary = cosemAarqApduMatchesGuruxReference
      ? "match"
      : summarizeBinaryDiff(rest, ref)
    const confHex = (
      initiateSnapshot?.proposedConformance24 ?? GURUX_INITIAL_LN_PROPOSED_CONFORMANCE
    ).toString(16)
    const maxPdu = initiateSnapshot?.maxPduSize ?? 0xffff
    aarqInitiateProfileLabel = initiateSnapshot?.profileLabel ?? "gurux_default"
    aarqInitiateMaxPduSize = maxPdu
    aarqInitiateProposedConformanceHex = confHex
    guruxUaParseEffectNote = `Initiate_conformance_0x${confHex}_maxpdu_${maxPdu}_dlmsver_6;_HDLC_segmentation_uses_UA_negotiated_maxInfoTX_in_ingress_runtime.`
  }

  return {
    builder,
    llcHex,
    expectedLlcSendHex,
    llcMatchesReference: llcHex === expectedLlcSendHex,
    cosemAarqApduHex: Buffer.from(rest).toString("hex"),
    llcPlusApduHex: Buffer.from(llcPlusApdu).toString("hex"),
    passwordUtf8ByteLength: txLen,
    callingAuthenticationValueHex: auth.callingAuthenticationValueHex,
    transmittedPasswordOctetsHex: txHex,
    transmittedPasswordUtf8ByteLength: txLen,
    passwordWireAsUtf8: auth.passwordWireAsUtf8,
    configuredPasswordSourceLabel: cmp.configuredPasswordSourceLabel,
    configuredPasswordUtf8: cmp.configuredPasswordUtf8,
    configuredPasswordUtf8ByteLength: cmp.configuredPasswordUtf8ByteLength,
    configuredPasswordSha256Hex: cmp.configuredPasswordSha256Hex,
    configuredUtf8BytesMatchTransmittedOctets: cmp.configuredUtf8BytesMatchTransmittedOctets,
    configuredStringMatchesWireUtf8Decoding: cmp.configuredStringMatchesWireUtf8Decoding,
    passwordComparisonNote: cmp.passwordComparisonNote,
    mvpAmiAlignmentNote:
      "MVP-AMI/Gurux LOW_LN AARQ includes user-information (BE) with xDLMS InitiateRequest (conformance + max PDU + version); password → UTF-8 in AC.",
    guruxReferenceCosemAarqApduHex,
    cosemAarqApduMatchesGuruxReference,
    aarqGuruxDiffSummary,
    guruxUaParseEffectNote,
    aarqInitiateProfileLabel,
    aarqInitiateMaxPduSize,
    aarqInitiateProposedConformanceHex,
    secretsExposureNote:
      "Ingress trace may include plaintext LLS password and AC hex; verify only on controlled hosts. UI-entered passwords elsewhere are not this runtime secret unless they equal RUNTIME_INGRESS_DLMS_PASSWORD.",
  }
}
