import type net from "node:net"

import type {
  IngressAareHuntReportPublic,
  IngressOutboundAarqDiagPublic,
  IngressProtocolTracePublic,
  IngressSocketCloseDiagnosticPublic,
  IngressSocketCloseOrigin,
  OutboundAssociationHdlcDiagPublic,
} from "@/lib/runtime/ingress/types"
import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"
import type { SocketBurstEndReason } from "@/lib/runtime/real/dlms-transport-session"
import { buildAareSearchReport } from "@/lib/runtime/real/dlms-aare-hunt"
import {
  capHex,
  hasStrictUaFrame,
  inspectHdlcFrameSegment,
} from "@/lib/runtime/real/hdlc-frame-inspect"
import { splitHdlcFrames } from "@/lib/runtime/real/hdlc-frame-variable"

const MAX_STEPS = 120
const MAX_INBOUND_FRAME_LOG = 32
const MAX_OUTBOUND_FRAME_LOG = 24
const MAX_ACCUM_HEX_CHARS = 24000
const MAX_FRAME_HEX_CHARS = 4096

let loggedFrameFingerprints = new Set<string>()

type MutableIngressSocketSession = {
  lastOutboundIso: string | null
  lastOutboundPhase: string | null
  timeoutExpiryIso: string | null
  timeoutExpiryPhase: string | null
  postAarqMaxWaitZeroRx: boolean
  socketErrorIso: string | null
  socketErrorMessage: string | null
  socketCloseIso: string | null
  socketCloseHadError: boolean
  peerClosedBeforeServerTeardown: boolean
  serverTeardownStarted: boolean
  discFinalAttempted: boolean
  discFinalIso: string | null
}

function emptyMutableSocketSession(): MutableIngressSocketSession {
  return {
    lastOutboundIso: null,
    lastOutboundPhase: null,
    timeoutExpiryIso: null,
    timeoutExpiryPhase: null,
    postAarqMaxWaitZeroRx: false,
    socketErrorIso: null,
    socketErrorMessage: null,
    socketCloseIso: null,
    socketCloseHadError: false,
    peerClosedBeforeServerTeardown: false,
    serverTeardownStarted: false,
    discFinalAttempted: false,
    discFinalIso: null,
  }
}

let mutableSocketSession = emptyMutableSocketSession()

function isPostAarqReadPhase(phase: string): boolean {
  return phase === "after_aarq" || phase.startsWith("await_aare_")
}

/** Attach once per accepted inbound DLMS socket (before reads/writes). */
export function attachIngressSocketCloseInstrumentation(socket: net.Socket): void {
  socket.once("error", (err: Error) => {
    mutableSocketSession.socketErrorIso = new Date().toISOString()
    mutableSocketSession.socketErrorMessage = err.message
  })
  socket.once("close", (hadError: boolean) => {
    mutableSocketSession.socketCloseIso = new Date().toISOString()
    mutableSocketSession.socketCloseHadError = Boolean(hadError)
    if (!mutableSocketSession.serverTeardownStarted) {
      mutableSocketSession.peerClosedBeforeServerTeardown = true
    }
  })
}

/** Call at the start of inbound session `finally` before DISC / destroy. */
export function markIngressSocketServerTeardownStarted(): void {
  mutableSocketSession.serverTeardownStarted = true
}

export function recordIngressReadBurstForSocketClose(
  phase: string,
  endReason: SocketBurstEndReason,
  byteLength: number
): void {
  if (!isPostAarqReadPhase(phase)) return
  if (endReason === "max_wait_ms") {
    const iso = new Date().toISOString()
    mutableSocketSession.timeoutExpiryIso = iso
    mutableSocketSession.timeoutExpiryPhase = phase
    if (byteLength === 0) {
      mutableSocketSession.postAarqMaxWaitZeroRx = true
    }
  }
}

export function emptyIngressProtocolTrace(): IngressProtocolTracePublic {
  return {
    startedAtIso: new Date().toISOString(),
    steps: [],
    inboundFrames: [],
    outboundFrames: [],
    lastMeterAccumHexCapped: null,
    leadingGarbageHex: null,
    lastIncompleteTailHex: null,
    lastUaStrictFound: false,
    lastUaCandidateSummary: null,
    lastSnrmStrictSummary: null,
    lastFrameParseSummary: "",
    lastFcsValidationNote: "",
    lastAarqAareSummary: null,
    aarqAareSteps: [],
    lastAareHuntReport: null,
    lastOutboundAarqDiagnostic: null,
    lastOutboundAssociationHdlcDiagnostic: null,
    socketCloseDiagnostic: null,
  }
}

function trace(): IngressProtocolTracePublic {
  const s = getIngressProcessRuntime().diagnostics
  if (!s.inboundProtocolTrace) s.inboundProtocolTrace = emptyIngressProtocolTrace()
  return s.inboundProtocolTrace
}

/** New TCP session: reset trace bucket and per-session frame deduplication. */
export function markNewIngressProtocolSession(): void {
  loggedFrameFingerprints = new Set()
  mutableSocketSession = emptyMutableSocketSession()
  getIngressProcessRuntime().diagnostics.inboundProtocolTrace = emptyIngressProtocolTrace()
}

export function traceProtocolStep(phase: string, detail?: string): void {
  const t = trace()
  if (t.steps.length >= MAX_STEPS) t.steps.shift()
  t.steps.push({ t: new Date().toISOString(), phase, detail })
}

const MAX_AARE_HUNT_STEPS = 24

/**
 * After each inbound burst following AARQ: record rx delta, HDLC segment count, and AARE hunt outcome.
 * `accumLenBeforeBurst` must be accum.length before the read that produced the current `accum`.
 * `postAarqRxBoundary` = accum.length immediately before the AARQ I-frame was transmitted (search only `accum[boundary..]`).
 */
export function traceAareHuntStep(
  phase: string,
  accum: Uint8Array,
  accumLenBeforeBurst: number,
  postAarqRxBoundary: number
): void {
  const t = trace()
  const rep = buildAareSearchReport(accum, {
    maxRows: 8,
    onlyFromByteOffset: postAarqRxBoundary,
  })
  const pub: IngressAareHuntReportPublic = {
    code: rep.code,
    summary: rep.summary,
    completeHdlcFrameCount: rep.completeHdlcFrameCount,
    iFrameVariantCount: rep.iFrameVariantCount,
    postAarqBoundary: rep.postAarqBoundary,
    rxSliceByteLength: rep.rxSliceByteLength,
    rows: rep.rows.map((r) => ({
      frameHexCapped: r.frameHexCapped,
      addressModel: r.addressModel,
      destLen: r.destLen,
      srcLen: r.srcLen,
      payloadByteLength: r.payloadByteLength,
      llcStripped: r.llcStripped,
      apduPrefixHex: r.apduPrefixHex,
      hasTag61: r.hasTag61,
      associationResultEnum: r.associationResultEnum,
      rowNote: r.rowNote,
    })),
  }
  t.lastAareHuntReport = pub
  t.lastAarqAareSummary = `${rep.code}:${rep.summary}`

  if (t.aarqAareSteps.length >= MAX_AARE_HUNT_STEPS) t.aarqAareSteps.shift()
  t.aarqAareSteps.push({
    t: new Date().toISOString(),
    phase,
    deltaRxBytes: Math.max(0, accum.length - accumLenBeforeBurst),
    accumTotalBytes: accum.length,
    completeHdlcSegments: rep.completeHdlcFrameCount,
    huntCode: rep.code,
    huntSummary: rep.summary,
    rowCount: rep.rows.length,
    postAarqBoundary: postAarqRxBoundary,
    rxSliceByteLength: rep.rxSliceByteLength,
  })
}

export function traceOutboundAarqDiagnostic(diag: IngressOutboundAarqDiagPublic): void {
  trace().lastOutboundAarqDiagnostic = diag
}

export function traceOutboundAssociationHdlcDiagnostic(diag: OutboundAssociationHdlcDiagPublic): void {
  trace().lastOutboundAssociationHdlcDiagnostic = diag
}

export function traceOutboundFrame(phase: string, data: Buffer): void {
  const t = trace()
  const iso = new Date().toISOString()
  mutableSocketSession.lastOutboundIso = iso
  mutableSocketSession.lastOutboundPhase = phase
  if (phase === "disc_final") {
    mutableSocketSession.discFinalAttempted = true
    mutableSocketSession.discFinalIso = iso
  }
  const hex = capHex(data.toString("hex"), MAX_FRAME_HEX_CHARS)
  if (t.outboundFrames.length >= MAX_OUTBOUND_FRAME_LOG) t.outboundFrames.shift()
  t.outboundFrames.push({
    t: iso,
    phase,
    frameHex: hex,
    byteLength: data.length,
  })
}

/**
 * Freeze socket-close evidence onto the protocol trace (call from inbound session `finally`).
 */
export function finalizeIngressSocketCloseDiagnostic(params: {
  discConfigured: boolean
}): void {
  const m = mutableSocketSession
  let closeOrigin: IngressSocketCloseOrigin
  const notes: string[] = []

  if (m.socketErrorIso) {
    closeOrigin = "socket_error_before_close"
    notes.push("socket_error_event_observed")
  } else if (m.peerClosedBeforeServerTeardown) {
    if (m.socketCloseHadError) {
      closeOrigin = "socket_error_before_close"
      notes.push("peer_close_with_hadError_true")
    } else {
      closeOrigin = "socket_closed_by_peer"
      notes.push("tcp_close_before_server_teardown")
    }
  } else if (m.postAarqMaxWaitZeroRx) {
    closeOrigin = "closed_after_post_aarq_timeout"
    notes.push("post_aarq_read_hit_max_wait_ms_with_0_rx_bytes")
    if (m.discFinalAttempted) notes.push("disc_still_sent_in_finally")
  } else if (m.discFinalAttempted || params.discConfigured) {
    closeOrigin = "closed_after_disc_final"
    if (!m.discFinalAttempted && params.discConfigured) {
      notes.push("disc_configured_but_not_traced_written")
    }
    if (!params.discConfigured) {
      notes.push("disc_disabled_destroy_only")
    }
  } else {
    closeOrigin = "closed_after_disc_final"
    notes.push("server_destroy_fallback")
  }

  const pub: IngressSocketCloseDiagnosticPublic = {
    closeOrigin,
    lastOutboundFrameIso: m.lastOutboundIso,
    lastOutboundFramePhase: m.lastOutboundPhase,
    timeoutExpiryIso: m.timeoutExpiryIso,
    timeoutExpiryPhase: m.timeoutExpiryPhase,
    socketCloseIso: m.socketCloseIso,
    socketCloseHadError: m.socketCloseHadError,
    discFinalAttempted: m.discFinalAttempted,
    discFinalIso: m.discFinalIso,
    postAarqMaxWaitZeroRx: m.postAarqMaxWaitZeroRx,
    peerClosedBeforeServerTeardown: m.peerClosedBeforeServerTeardown,
    socketErrorIso: m.socketErrorIso,
    socketErrorMessage: m.socketErrorMessage,
    finalizedAtIso: new Date().toISOString(),
    detailNote: notes.join(";"),
  }
  trace().socketCloseDiagnostic = pub
}

function leadingGarbageHex(accum: Uint8Array): string | null {
  const i = accum.indexOf(0x7e)
  if (i <= 0) return null
  return capHex(Buffer.from(accum.subarray(0, i)).toString("hex"), 2000)
}

function tailAfterLastFlagHex(accum: Uint8Array): string | null {
  if (accum.length === 0) return null
  const last = accum.lastIndexOf(0x7e)
  if (last < 0) return capHex(Buffer.from(accum).toString("hex"), 2000)
  if (last === accum.length - 1) return null
  return capHex(Buffer.from(accum.subarray(last + 1)).toString("hex"), 2000)
}

/**
 * Record meter-side bytes: capped accum snapshot, new complete HDLC segments, summaries.
 */
export function traceMeterAccumSnapshot(accum: Uint8Array, phase: string): void {
  const t = trace()
  t.lastMeterAccumHexCapped = capHex(Buffer.from(accum).toString("hex"), MAX_ACCUM_HEX_CHARS)
  t.leadingGarbageHex = leadingGarbageHex(accum)
  t.lastIncompleteTailHex = tailAfterLastFlagHex(accum)
  t.lastUaStrictFound = hasStrictUaFrame(accum)

  const frames = splitHdlcFrames(accum)
  const parsePieces: string[] = []
  const fcsNotes: string[] = []

  for (const raw of frames) {
    const fp = Buffer.from(raw).toString("hex").slice(0, 200)
    if (loggedFrameFingerprints.has(fp)) continue
    loggedFrameFingerprints.add(fp)

    const rec = inspectHdlcFrameSegment(raw)
    parsePieces.push(`${rec.byteLength}B:${rec.summary}`)
    if (rec.eaGurux?.rejectReason) {
      fcsNotes.push(`gurux_EA:${rec.eaGurux.rejectReason}`)
    }
    if (
      rec.variants.filter((v) => v.controlLabel === "UA").length === 0 &&
      rec.heuristicUaByteOffsetsInInner.length > 0
    ) {
      fcsNotes.push(
        `0x73_at_inner_offsets_${rec.heuristicUaByteOffsetsInInner.join(",")}_no_strict_UA_in_variants`
      )
    }
    if (rec.formatNote !== "ok_a0_family") {
      fcsNotes.push(`format:${rec.formatNote}`)
    }

    if (t.inboundFrames.length >= MAX_INBOUND_FRAME_LOG) t.inboundFrames.shift()
    t.inboundFrames.push({
      t: new Date().toISOString(),
      phase,
      frameHex: rec.frameHex,
      byteLength: rec.byteLength,
      formatByte: rec.formatByte,
      formatNote: rec.formatNote,
      lengthByte: rec.lengthByte,
      variants: rec.variants.map((v) => ({
        destLen: v.destLen,
        srcLen: v.srcLen,
        kind: v.kind,
        control: v.control,
        controlLabel: v.controlLabel,
        destHex: v.destHex,
        srcHex: v.srcHex,
        fcsValid: v.fcsValid,
        addressModel: v.addressModel,
        headerFcsEndian: v.headerFcsEndian,
        payloadFcsEndian: v.payloadFcsEndian,
      })),
      heuristicUaOffsetsInInner: rec.heuristicUaByteOffsetsInInner,
      summary: rec.summary,
      eaGurux: rec.eaGurux,
    })
  }

  t.lastFrameParseSummary = parsePieces.join(" | ").slice(0, 8000)
  t.lastFcsValidationNote = fcsNotes.join(" | ").slice(0, 4000) || t.lastFcsValidationNote

  const strictUa = t.inboundFrames.flatMap((f) =>
    f.variants.filter((v) => v.controlLabel === "UA")
  )
  t.lastUaCandidateSummary = strictUa.length
    ? `strict_UA_FCS_ok_${strictUa.length}_variant(s)_dest_src_${strictUa.map((v) => `${v.destLen}+${v.srcLen}`).join(";")}`
    : t.lastUaStrictFound
      ? "unexpected:strict_flag_true_but_no_logged_variant"
      : "no_strict_UA; see heuristicUaOffsetsInInner per inboundFrame and lastFcsValidationNote"

  const strictSnrm = t.inboundFrames.flatMap((f) =>
    f.variants.filter((v) => v.controlLabel === "SNRM" && v.kind === "u")
  )
  t.lastSnrmStrictSummary =
    strictSnrm.length > 0
      ? `strict_SNRM_${strictSnrm.length}_variant(s)_` +
        strictSnrm.map((v) => `${v.destLen}+${v.srcLen}`).join(";")
      : "no_strict_SNRM_in_logged_frames"
}

