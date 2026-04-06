import type net from "node:net"

import { classifyInboundPreview } from "@/lib/runtime/ingress/classify"
import {
  inboundAarqInitiateSnapshot,
  inboundAarqInitiateWireOptions,
  type InboundMeterProtocolProfile,
} from "@/lib/runtime/ingress/inbound-profile"
import { flushIngressTraceToFile } from "@/lib/runtime/ingress/protocol-trace-file"
import {
  attachIngressSocketCloseInstrumentation,
  finalizeIngressSocketCloseDiagnostic,
  markIngressSocketServerTeardownStarted,
  markNewIngressProtocolSession,
  recordIngressReadBurstForSocketClose,
  traceAareHuntStep,
  traceMeterAccumSnapshot,
  traceOutboundAarqDiagnostic,
  traceOutboundAssociationHdlcDiagnostic,
  traceOutboundFrame,
  traceProtocolStep,
} from "@/lib/runtime/ingress/protocol-trace"
import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"
import {
  appendStagedTriggerTrace,
  resetStagedTriggerResultFields,
} from "@/lib/runtime/ingress/staged-socket"
import {
  onIngressError,
  onSessionData,
  setInboundAssociationOutcome,
  setInboundIdentityOutcome,
  setInboundProtocolPhase,
} from "@/lib/runtime/ingress/state"
import { buildAarqLlsLnPayload } from "@/lib/runtime/real/dlms-aarq-lls"
import { buildAarqPayload, listLlcStripVariantsForMeterReply } from "@/lib/runtime/real/dlms-apdu"
import { buildAareSearchReport, findAareInMeterAccum } from "@/lib/runtime/real/dlms-aare-hunt"
import {
  describeOutboundAarqPayload,
  type AarqBuilderKind,
  type OutboundAarqPasswordContext,
} from "@/lib/runtime/real/dlms-aarq-diag"
import {
  buildGetRequestNormalPayload,
  obisStringToSixBytes,
  parseGetResponseNormal,
} from "@/lib/runtime/real/dlms-get-normal"
import {
  enumerateAllValidHdlcParses,
  findFirstStrictSnrmVariant,
  findFirstStrictUaFrameBytes,
  findFirstStrictUaVariant,
  hasStrictUaFrame,
} from "@/lib/runtime/real/hdlc-frame-inspect"
import { createClientHdlcIframeState } from "@/lib/runtime/real/hdlc-client-sequence"
import {
  buildGuruxStyleClientHdlcIFrames,
  nextClientIframeControlAfterSegments,
} from "@/lib/runtime/real/hdlc-gurux-iframe"
import { parseNegotiatedHdlcFromUaFrame } from "@/lib/runtime/real/hdlc-ua-negotiated"
import {
  buildHdlcIFrame,
  buildHdlcUFrame,
  HDLC_DISC,
  HDLC_SNRM,
  HDLC_UA,
  splitHdlcFrames,
} from "@/lib/runtime/real/hdlc-frame-variable"
import { readSocketBurstWithReason, writeAll } from "@/lib/runtime/real/dlms-transport-session"

import type { IngressSessionClass } from "@/lib/runtime/ingress/types"

/** Avoid Node 20+ Buffer/Uint8Array `ArrayBufferLike` assignability noise in this module. */
type Acc = Uint8Array<ArrayBuffer>

type InboundAssocAccumState = { accum: Acc; meter: Buffer }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function previewClassFromBytes(accum: Uint8Array): IngressSessionClass {
  const slice = accum.subarray(0, Math.min(512, accum.length))
  const heur = classifyInboundPreview(Buffer.from(slice))
  return heur === "hdlc_candidate" ? "dlms_not_verified" : heur
}

function touchAccum(accum: Uint8Array): void {
  const prev = accum.subarray(0, Math.min(512, accum.length))
  onSessionData(accum.length, Buffer.from(prev), previewClassFromBytes(accum))
}

function bufferPrefixMatch(buf: Uint8Array, prefix: Buffer): boolean {
  if (buf.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (buf[i] !== prefix[i]) return false
  }
  return true
}

function findGetResponse(accum: Uint8Array): ReturnType<typeof parseGetResponseNormal> | null {
  for (const raw of splitHdlcFrames(accum)) {
    for (const v of enumerateAllValidHdlcParses(raw)) {
      if (v.parsed.kind !== "i") continue
      for (const { apdu } of listLlcStripVariantsForMeterReply(v.parsed.llcAndApdu)) {
        const g = parseGetResponseNormal(apdu)
        if (g.verified) return g
      }
    }
  }
  return null
}

function capHex(hex: string, max = 512): string {
  return hex.length <= max ? hex : `${hex.slice(0, max)}…`
}

async function writeMeter(socket: net.Socket, data: Buffer, phase: string): Promise<void> {
  traceOutboundFrame(phase, data)
  traceProtocolStep(`tx_${phase}`, `${data.length}B`)
  await writeAll(socket, data)
}

async function extendAccum(
  socket: net.Socket,
  accum: Acc,
  profile: InboundMeterProtocolProfile,
  rxPhase: string
): Promise<Acc> {
  const burst = await readSocketBurstWithReason(
    socket,
    profile.dlmsReadTimeoutMs,
    profile.dlmsReadIdleMs
  )
  recordIngressReadBurstForSocketClose(rxPhase, burst.endReason, burst.data.length)
  const chunk = burst.data
  const next = new Uint8Array(accum.length + chunk.length)
  next.set(accum, 0)
  next.set(chunk, accum.length)
  touchAccum(next)
  traceMeterAccumSnapshot(next, rxPhase)
  return Uint8Array.from(next) as Acc
}

export async function finalizeInboundMeterSocketSession(
  socket: net.Socket,
  profile: InboundMeterProtocolProfile,
  accum: Acc,
  meter: Buffer,
  client: Buffer
): Promise<void> {
  markIngressSocketServerTeardownStarted()
  traceMeterAccumSnapshot(accum, "session_finally")
  if (profile.sendDiscBeforeClose) {
    try {
      const disc = buildHdlcUFrame(meter, client, HDLC_DISC)
      traceOutboundFrame("disc_final", disc)
      traceProtocolStep("tx_disc_final", `${disc.length}B`)
      await writeAll(socket, disc)
      const drain = await readSocketBurstWithReason(
        socket,
        Math.max(300, profile.discDrainTimeoutMs),
        Math.min(150, profile.dlmsReadIdleMs)
      )
      recordIngressReadBurstForSocketClose("disc_drain", drain.endReason, drain.data.length)
    } catch {
      /* best-effort */
    }
  }
  finalizeIngressSocketCloseDiagnostic({
    discConfigured: profile.sendDiscBeforeClose,
  })
  flushIngressTraceToFile("session_end")
  if (!socket.destroyed) socket.destroy()
}

/**
 * HDLC/DLMS association from an RX accumulator: auto path feeds the first meter burst; staged path
 * feeds bytes captured after host-driven IEC/ACK/delay (MVP-AMI TCP POC ordering experiment).
 */
export async function runInboundDlmsAssociationFromFirstAccum(
  socket: net.Socket,
  profile: InboundMeterProtocolProfile,
  state: InboundAssocAccumState,
  client: Buffer,
  options: { skipAutomaticPrefixAckSleep: boolean }
): Promise<void> {
  if (!options.skipAutomaticPrefixAckSleep) {
    const ackHit = profile.iecAckHexCandidates.find((c) =>
      bufferPrefixMatch(state.accum, c)
    )
    if (ackHit && profile.afterIecSleepMs > 0) {
      setInboundProtocolPhase("iec_ack_matched", ackHit.toString("hex"))
      traceProtocolStep("iec_ack_sleep", `${profile.afterIecSleepMs}ms`)
      await sleep(profile.afterIecSleepMs)
    }
  }

  const meterSnrm = findFirstStrictSnrmVariant(state.accum)
  if (meterSnrm) {
    setInboundProtocolPhase("meter_snrm_seen", "")
    traceProtocolStep("meter_snrm_strict", `${meterSnrm.destLen}+${meterSnrm.srcLen}`)
    const uaDest = Buffer.from(meterSnrm.parsed.src)
    const uaSrc = profile.uaSwapAddresses
      ? Buffer.from(meterSnrm.parsed.dest)
      : profile.clientAddressWire
    await writeMeter(socket, buildHdlcUFrame(uaDest, uaSrc, HDLC_UA), "ua_after_meter_snrm")
    setInboundProtocolPhase("ua_sent_after_meter_snrm", "")
    state.accum = await extendAccum(socket, state.accum, profile, "after_ua_sent")
  } else if (
    profile.useBroadcastSnrmFirst &&
    profile.broadcastSnrm &&
    profile.broadcastSnrm.length > 0
  ) {
    setInboundProtocolPhase("broadcast_snrm_sent", "")
    await writeMeter(socket, profile.broadcastSnrm, "broadcast_snrm")
    state.accum = await extendAccum(socket, state.accum, profile, "after_broadcast_snrm")
  } else {
    setInboundProtocolPhase("targeted_snrm_sent", "")
    await writeMeter(
      socket,
      buildHdlcUFrame(state.meter, client, HDLC_SNRM),
      "targeted_snrm"
    )
    state.accum = await extendAccum(socket, state.accum, profile, "after_targeted_snrm")
  }

  setInboundProtocolPhase("awaiting_ua", "")
  for (let i = 0; i < 8 && !hasStrictUaFrame(state.accum); i++) {
    traceProtocolStep("await_ua_burst", String(i))
    state.accum = await extendAccum(socket, state.accum, profile, `await_ua_${i}`)
  }
  if (!hasStrictUaFrame(state.accum)) {
    traceMeterAccumSnapshot(state.accum, "ua_missing_final")
    traceProtocolStep(
      "ua_missing",
      "no_strict_UA_FCS_ok_see_inboundProtocolTrace.inboundFrames"
    )
    setInboundProtocolPhase("ua_missing", "no verifiable HDLC UA after SNRM/broadcast")
    onIngressError("inbound_ua_missing")
    onSessionData(
      state.accum.length,
      Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
      "inbound_session_failed"
    )
    return
  }

  traceProtocolStep("ua_strict_ok", "proceeding_to_aarq")

  const uaLearned = findFirstStrictUaVariant(state.accum)
  if (uaLearned && uaLearned.parsed.control === HDLC_UA) {
    state.meter = Buffer.from(uaLearned.parsed.src)
    traceProtocolStep(
      "meter_hdlc_address_learned_from_ua",
      `${uaLearned.addressModel}:${state.meter.toString("hex")}`
    )
  }

  const uaFrameBytes = findFirstStrictUaFrameBytes(state.accum)
  const negotiated = uaFrameBytes
    ? parseNegotiatedHdlcFromUaFrame(uaFrameBytes)
    : parseNegotiatedHdlcFromUaFrame(new Uint8Array(0))

  const hdlcSeq = createClientHdlcIframeState()

  const aarqPayload =
    profile.auth === "LOW" && profile.password
      ? buildAarqLlsLnPayload(
          profile.password,
          inboundAarqInitiateWireOptions(profile.aarqInitiate)
        )
      : buildAarqPayload()

  const { frames: aarqFrames, diag: aarqHdlcDiag } = buildGuruxStyleClientHdlcIFrames({
    serverAddress: state.meter,
    clientAddress: client,
    payload: aarqPayload,
    maxInfoTX: negotiated.maxInfoTX,
    seq: hdlcSeq,
  })

  traceOutboundAssociationHdlcDiagnostic({
    uaNegotiatedParseSource: negotiated.parseSource,
    uaNegotiatedMaxInfoTX: negotiated.maxInfoTX,
    uaNegotiatedMaxInfoRX: negotiated.maxInfoRX,
    uaNegotiatedWindowSizeTX: negotiated.windowSizeTX,
    uaNegotiatedWindowSizeRX: negotiated.windowSizeRX,
    uaInformationFieldHexCapped: negotiated.uaInformationFieldHexCapped,
    uaNegotiatedParseNote: negotiated.parseNote,
    aarqInitiateProfileLabel: profile.aarqInitiate.profileLabel,
    aarqInitiateMaxPduSize: profile.aarqInitiate.maxPduSize,
    aarqInitiateProposedConformanceHex:
      profile.aarqInitiate.proposedConformance24.toString(16),
    aarqHdlcSegmentCount: aarqHdlcDiag.segmentCount,
    aarqHdlcMultiSegment: aarqHdlcDiag.multiSegment,
    aarqHdlcMaxInfoTXUsed: aarqHdlcDiag.maxInfoTXInput,
    aarqHdlcControlsHex: aarqHdlcDiag.controlsHex,
    aarqHdlcFormatBytesHex: aarqHdlcDiag.formatBytesHex,
    aarqHdlcLengthBytes: aarqHdlcDiag.lengthBytes,
    aarqHdlcPayloadBytesPerSegment: aarqHdlcDiag.payloadBytesPerSegment,
    hdlcIframeBuilderId: aarqHdlcDiag.builderId,
    guruxReferenceNote:
      "Gurux_GXDLMS.getLnMessages+getHdlcFrame;_GXDLMS.parseSnrmUaResponse_updates_hdlc.maxInfoTX",
  })

  setInboundProtocolPhase("aarq_sent", "")
  setInboundAssociationOutcome({
    attempted: true,
    verifiedOnWire: false,
    resultEnum: null,
    aareApduHex: null,
  })

  const postAarqRxBoundary = state.accum.length
  const aarqBuilder: AarqBuilderKind =
    profile.auth === "LOW" && profile.password ? "LOW_LLS_LN" : "LN_MINIMAL_NO_AUTH"
  const aarqPasswordCtx: OutboundAarqPasswordContext = {
    configuredPasswordUtf8: profile.password,
    configuredPasswordSourceLabel:
      profile.auth === "LOW" ? "RUNTIME_INGRESS_DLMS_PASSWORD" : "N_A_AUTH_NOT_LOW",
  }
  const initiateSnapshot =
    profile.auth === "LOW" ? inboundAarqInitiateSnapshot(profile.aarqInitiate) : undefined
  const aarqDiag = describeOutboundAarqPayload(
    aarqPayload,
    aarqBuilder,
    aarqPasswordCtx,
    initiateSnapshot
  )
  traceOutboundAarqDiagnostic({
    ...aarqDiag,
    meterAddressHexForIframe: state.meter.toString("hex"),
    clientAddressHexForIframe: client.toString("hex"),
  })
  traceProtocolStep(
    "aarq_iframe_sent",
    `builder=${aarqBuilder}_segs=${aarqFrames.length}_maxInfoTX=${negotiated.maxInfoTX}_ua_parse=${negotiated.parseSource}_init_profile=${profile.aarqInitiate.profileLabel}_meter=${state.meter.toString("hex")}_client=${client.toString("hex")}_llc_ref_ok=${String(aarqDiag.llcMatchesReference)}_gurux_aarq_ref_match=${String(aarqDiag.cosemAarqApduMatchesGuruxReference)}_aarq_gurux_diff=${aarqDiag.aarqGuruxDiffSummary}_pwd_tx_len=${aarqDiag.transmittedPasswordUtf8ByteLength ?? "n/a"}_pwd_cfg_match_octets=${String(aarqDiag.configuredUtf8BytesMatchTransmittedOctets)}_pwd_note=${aarqDiag.passwordComparisonNote}`
  )
  for (let seg = 0; seg < aarqFrames.length; seg++) {
    await writeMeter(socket, aarqFrames[seg]!, `aarq_iframe_seg_${seg}`)
  }
  state.accum = await extendAccum(socket, state.accum, profile, "after_aarq")
  traceAareHuntStep("after_aarq", state.accum, postAarqRxBoundary, postAarqRxBoundary)

  let aareHit = findAareInMeterAccum(state.accum, postAarqRxBoundary)
  for (let i = 0; i < 8 && !aareHit; i++) {
    const lenBeforeBurst = state.accum.length
    state.accum = await extendAccum(socket, state.accum, profile, `await_aare_${i}`)
    traceAareHuntStep(`await_aare_${i}`, state.accum, lenBeforeBurst, postAarqRxBoundary)
    aareHit = findAareInMeterAccum(state.accum, postAarqRxBoundary)
  }

  if (!aareHit) {
    const rep = buildAareSearchReport(state.accum, {
      maxRows: 12,
      onlyFromByteOffset: postAarqRxBoundary,
    })
    traceProtocolStep(
      "aare_missing_final",
      `${rep.code}|${rep.summary}|see_lastAareHuntReport_and_aarqAareSteps`
    )
    setInboundProtocolPhase("aare_missing", `${rep.code}: ${rep.summary}`)
    setInboundAssociationOutcome({
      attempted: true,
      verifiedOnWire: false,
      resultEnum: null,
      aareApduHex: null,
    })
    onIngressError(
      rep.code === "post_aarq_zero_rx"
        ? "inbound_aare_no_rx_after_aarq"
        : "inbound_aare_missing"
    )
    onSessionData(
      state.accum.length,
      Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
      "inbound_session_failed"
    )
    return
  }

  traceProtocolStep("aare_parsed", `association_result_enum=${aareHit.result}`)

  if (aareHit.result !== 0) {
    traceProtocolStep("aare_rejected_on_wire", `association_result_enum=${aareHit.result}`)
    setInboundProtocolPhase("aare_rejected", `association-result=${aareHit.result}`)
    setInboundAssociationOutcome({
      attempted: true,
      verifiedOnWire: false,
      resultEnum: aareHit.result,
      aareApduHex: capHex(aareHit.apdu.toString("hex")),
    })
    onIngressError(`inbound_aare_rejected_${aareHit.result}`)
    onSessionData(
      state.accum.length,
      Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
      "inbound_session_failed"
    )
    return
  }

  traceProtocolStep("aare_accepted_on_wire", "association_result_enum=0")
  setInboundProtocolPhase("association_accepted", "")
  setInboundAssociationOutcome({
    attempted: true,
    verifiedOnWire: true,
    resultEnum: 0,
    aareApduHex: capHex(aareHit.apdu.toString("hex")),
  })
  onSessionData(
    state.accum.length,
    Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
    "inbound_association_verified"
  )

  const obis = obisStringToSixBytes(profile.identityObis)
  if (!obis) {
    setInboundProtocolPhase("identity_obis_invalid", profile.identityObis)
    setInboundIdentityOutcome({
      attempted: false,
      verifiedOnWire: false,
      valueHex: null,
    })
    onIngressError("inbound_identity_obis_invalid")
    return
  }

  const getPdu = buildGetRequestNormalPayload(
    profile.identityClassId,
    obis,
    profile.identityAttributeId
  )

  setInboundProtocolPhase("identity_get_sent", profile.identityObis)
  setInboundIdentityOutcome({
    attempted: true,
    verifiedOnWire: false,
    valueHex: null,
  })

  const identityCtrl = nextClientIframeControlAfterSegments(hdlcSeq)
  await writeMeter(
    socket,
    buildHdlcIFrame(state.meter, client, identityCtrl, getPdu),
    "identity_get"
  )
  state.accum = await extendAccum(socket, state.accum, profile, "after_identity_get")

  let getHit = findGetResponse(state.accum)
  for (let i = 0; i < 8 && !getHit?.verified; i++) {
    state.accum = await extendAccum(socket, state.accum, profile, `await_get_${i}`)
    getHit = findGetResponse(state.accum)
  }

  if (!getHit?.verified) {
    setInboundProtocolPhase("identity_get_unverified", getHit?.note ?? "no_get_response")
    setInboundIdentityOutcome({
      attempted: true,
      verifiedOnWire: false,
      valueHex: null,
    })
    onIngressError("inbound_identity_get_failed")
    onSessionData(
      state.accum.length,
      Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
      "inbound_association_verified"
    )
    return
  }

  setInboundProtocolPhase("identity_read_verified", getHit.note)
  setInboundIdentityOutcome({
    attempted: true,
    verifiedOnWire: true,
    valueHex: getHit.valueHex,
  })
  onSessionData(
    state.accum.length,
    Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
    "inbound_identity_read_verified"
  )
}

function falsyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const t = v.trim().toLowerCase()
  return t === "0" || t === "false" || t === "no"
}

function parseStagedPostTriggerSleepMs(profile: InboundMeterProtocolProfile): number {
  const raw = process.env.RUNTIME_INGRESS_STAGED_POST_TRIGGER_SLEEP_MS?.trim()
  if (raw === undefined || raw === "") return profile.afterIecSleepMs
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? Math.max(0, n) : profile.afterIecSleepMs
}

/**
 * MVP-AMI TCP POC–style ordering on a stashed socket: optional IEC `/?!`, first ACK candidate,
 * configured delay, then HDLC/DLMS (without auto-mode first-read / prefix-ACK sleep).
 */
export async function runStagedTriggeredInboundSession(
  socket: net.Socket,
  profile: InboundMeterProtocolProfile
): Promise<void> {
  if (!profile.sessionEnabled || !profile.valid) return

  const rt = getIngressProcessRuntime()
  const st = rt.staged
  resetStagedTriggerResultFields(st)
  markNewIngressProtocolSession()

  socket.setTimeout(0)
  attachIngressSocketCloseInstrumentation(socket)

  const client = profile.clientAddressWire
  const state: InboundAssocAccumState = {
    accum: new Uint8Array(0) as Acc,
    meter: Buffer.from(profile.meterServerAddress),
  }

  appendStagedTriggerTrace(st, "trigger_invoked")
  traceProtocolStep("staged_trigger_invoked", "api_start_session")
  setInboundProtocolPhase("staged_trigger", "api_start_session")

  if (falsyEnv(process.env.RUNTIME_INGRESS_STAGED_IEC_ENABLED)) {
    st.lastIecSkippedReason = "RUNTIME_INGRESS_STAGED_IEC_ENABLED=false"
    appendStagedTriggerTrace(st, "iec_skipped_disabled_by_env")
    traceProtocolStep("staged_iec_skipped", st.lastIecSkippedReason)
  } else {
    const hexRaw =
      process.env.RUNTIME_INGRESS_STAGED_IEC_REQUEST_HEX?.trim() ?? "2f3f210d0a"
    const clean = hexRaw.replace(/\s+/g, "")
    if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0 || clean.length === 0) {
      st.lastIecSkippedReason = "invalid_RUNTIME_INGRESS_STAGED_IEC_REQUEST_HEX"
      appendStagedTriggerTrace(st, "iec_skipped_invalid_hex")
      traceProtocolStep("staged_iec_skipped", st.lastIecSkippedReason)
    } else {
      const iecBuf = Buffer.from(clean, "hex")
      st.lastIecAttempted = true
      appendStagedTriggerTrace(st, "iec_tx")
      traceProtocolStep("staged_iec_ident_tx", clean)
      setInboundProtocolPhase("staged_iec_ident_sent", clean)
      await writeMeter(socket, iecBuf, "staged_iec_ident")
      const iecBurst = await readSocketBurstWithReason(
        socket,
        profile.dlmsReadTimeoutMs,
        profile.dlmsReadIdleMs
      )
      recordIngressReadBurstForSocketClose(
        "staged_after_iec_tx",
        iecBurst.endReason,
        iecBurst.data.length
      )
      const chunk = iecBurst.data
      const merged = new Uint8Array(state.accum.length + chunk.length)
      merged.set(state.accum, 0)
      merged.set(chunk, state.accum.length)
      state.accum = Uint8Array.from(merged) as Acc
      touchAccum(state.accum)
      traceMeterAccumSnapshot(state.accum, "staged_after_iec_tx")
    }
  }

  if (profile.iecAckHexCandidates.length === 0) {
    st.lastAckSkippedReason = "no_ACK_candidates_in_profile"
    appendStagedTriggerTrace(st, "ack_skipped_no_candidates")
    traceProtocolStep("staged_ack_skipped", st.lastAckSkippedReason)
  } else {
    const ack = profile.iecAckHexCandidates[0]!
    st.lastAckSent = true
    st.lastAckHexChosen = ack.toString("hex")
    appendStagedTriggerTrace(st, `ack_tx_first_candidate_${st.lastAckHexChosen}`)
    traceProtocolStep("staged_ack_tx", st.lastAckHexChosen)
    setInboundProtocolPhase("staged_iec_ack_sent", st.lastAckHexChosen)
    await writeMeter(socket, ack, "staged_iec_ack")
    const ackBurst = await readSocketBurstWithReason(
      socket,
      profile.dlmsReadTimeoutMs,
      profile.dlmsReadIdleMs
    )
    recordIngressReadBurstForSocketClose(
      "staged_after_ack_tx",
      ackBurst.endReason,
      ackBurst.data.length
    )
    const chunk = ackBurst.data
    const merged = new Uint8Array(state.accum.length + chunk.length)
    merged.set(state.accum, 0)
    merged.set(chunk, state.accum.length)
    state.accum = Uint8Array.from(merged) as Acc
    touchAccum(state.accum)
    traceMeterAccumSnapshot(state.accum, "staged_after_ack_tx")
  }

  const delayMs = parseStagedPostTriggerSleepMs(profile)
  st.lastDelayMs = delayMs
  appendStagedTriggerTrace(st, `delay_ms_${delayMs}`)
  traceProtocolStep("staged_post_iec_delay", `${delayMs}ms`)
  setInboundProtocolPhase("staged_post_trigger_delay", String(delayMs))
  await sleep(delayMs)
  st.lastDelayCompleted = true
  appendStagedTriggerTrace(st, "delay_done")

  st.lastDlmsAssociationStarted = true
  appendStagedTriggerTrace(st, "dlms_association_start")
  traceProtocolStep("staged_dlms_association_start", "")
  setInboundProtocolPhase("staged_dlms_association_start", "")

  try {
    await runInboundDlmsAssociationFromFirstAccum(socket, profile, state, client, {
      skipAutomaticPrefixAckSleep: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setInboundProtocolPhase("session_error", msg)
    onIngressError(`inbound_session_error: ${msg}`)
    traceProtocolStep("session_error", msg)
    onSessionData(
      state.accum.length,
      Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
      "inbound_session_failed"
    )
  } finally {
    const d = getIngressProcessRuntime().diagnostics
    st.lastAssociationAttempted = d.inboundAssociationAttempted
    st.lastIdentityReadAttempted = d.inboundIdentityReadAttempted
    appendStagedTriggerTrace(
      st,
      `teardown_socket_destroyed_${socket.destroyed ? "already" : "pending"}`
    )
    await finalizeInboundMeterSocketSession(
      socket,
      profile,
      state.accum,
      state.meter,
      client
    )
  }
}

/**
 * Vendor-style inbound DLMS on an already-accepted TCP socket (meter-initiated connect).
 * Caller must pass a valid profile with sessionEnabled true. Always destroys the socket when done.
 */
export async function runInboundDlmsOnSocket(
  socket: net.Socket,
  profile: InboundMeterProtocolProfile
): Promise<void> {
  if (!profile.sessionEnabled || !profile.valid) return

  socket.setTimeout(0)
  attachIngressSocketCloseInstrumentation(socket)

  const client = profile.clientAddressWire
  const state: InboundAssocAccumState = {
    accum: new Uint8Array(0) as Acc,
    meter: Buffer.from(profile.meterServerAddress),
  }

  try {
    traceProtocolStep("session_start", "inbound_dlms")
    setInboundProtocolPhase("initial_read", "")
    const firstBurst = await readSocketBurstWithReason(
      socket,
      profile.dlmsReadTimeoutMs,
      profile.dlmsReadIdleMs
    )
    recordIngressReadBurstForSocketClose(
      "initial_read",
      firstBurst.endReason,
      firstBurst.data.length
    )
    const first = firstBurst.data
    state.accum = Uint8Array.from(first) as Acc
    touchAccum(state.accum)
    traceMeterAccumSnapshot(state.accum, "initial_read")

    await runInboundDlmsAssociationFromFirstAccum(socket, profile, state, client, {
      skipAutomaticPrefixAckSleep: false,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setInboundProtocolPhase("session_error", msg)
    onIngressError(`inbound_session_error: ${msg}`)
    traceProtocolStep("session_error", msg)
    onSessionData(
      state.accum.length,
      Buffer.from(state.accum.subarray(0, Math.min(512, state.accum.length))),
      "inbound_session_failed"
    )
  } finally {
    await finalizeInboundMeterSocketSession(
      socket,
      profile,
      state.accum,
      state.meter,
      client
    )
  }
}
