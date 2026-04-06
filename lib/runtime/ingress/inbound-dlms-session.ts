import type net from "node:net"

import { classifyInboundPreview } from "@/lib/runtime/ingress/classify"
import type { InboundMeterProtocolProfile } from "@/lib/runtime/ingress/inbound-profile"
import { flushIngressTraceToFile } from "@/lib/runtime/ingress/protocol-trace-file"
import {
  traceAareHuntStep,
  traceMeterAccumSnapshot,
  traceOutboundAarqDiagnostic,
  traceOutboundFrame,
  traceProtocolStep,
} from "@/lib/runtime/ingress/protocol-trace"
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
} from "@/lib/runtime/real/dlms-aarq-diag"
import {
  buildGetRequestNormalPayload,
  obisStringToSixBytes,
  parseGetResponseNormal,
} from "@/lib/runtime/real/dlms-get-normal"
import {
  enumerateAllValidHdlcParses,
  findFirstStrictSnrmVariant,
  findFirstStrictUaVariant,
  hasStrictUaFrame,
} from "@/lib/runtime/real/hdlc-frame-inspect"
import {
  buildHdlcIFrame,
  buildHdlcUFrame,
  HDLC_DISC,
  HDLC_I_FRAME_FIRST,
  HDLC_I_FRAME_SECOND,
  HDLC_SNRM,
  HDLC_UA,
  splitHdlcFrames,
} from "@/lib/runtime/real/hdlc-frame-variable"
import { readSocketBurst, writeAll } from "@/lib/runtime/real/dlms-transport-session"

import type { IngressSessionClass } from "@/lib/runtime/ingress/types"

/** Avoid Node 20+ Buffer/Uint8Array `ArrayBufferLike` assignability noise in this module. */
type Acc = Uint8Array<ArrayBuffer>

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
  const chunk = await readSocketBurst(
    socket,
    profile.dlmsReadTimeoutMs,
    profile.dlmsReadIdleMs
  )
  const next = new Uint8Array(accum.length + chunk.length)
  next.set(accum, 0)
  next.set(chunk, accum.length)
  touchAccum(next)
  traceMeterAccumSnapshot(next, rxPhase)
  return Uint8Array.from(next) as Acc
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

  let meter = Buffer.from(profile.meterServerAddress)
  const client = profile.clientAddressWire
  let accum = new Uint8Array(0) as Acc

  try {
    traceProtocolStep("session_start", "inbound_dlms")
    setInboundProtocolPhase("initial_read", "")
    const first = await readSocketBurst(
      socket,
      profile.dlmsReadTimeoutMs,
      profile.dlmsReadIdleMs
    )
    accum = Uint8Array.from(first) as Acc
    touchAccum(accum)
    traceMeterAccumSnapshot(accum, "initial_read")

    const ackHit = profile.iecAckHexCandidates.find((c) => bufferPrefixMatch(accum, c))
    if (ackHit && profile.afterIecSleepMs > 0) {
      setInboundProtocolPhase("iec_ack_matched", ackHit.toString("hex"))
      traceProtocolStep("iec_ack_sleep", `${profile.afterIecSleepMs}ms`)
      await sleep(profile.afterIecSleepMs)
    }

    const meterSnrm = findFirstStrictSnrmVariant(accum)
    if (meterSnrm) {
      setInboundProtocolPhase("meter_snrm_seen", "")
      traceProtocolStep("meter_snrm_strict", `${meterSnrm.destLen}+${meterSnrm.srcLen}`)
      const uaDest = Buffer.from(meterSnrm.parsed.src)
      const uaSrc = profile.uaSwapAddresses
        ? Buffer.from(meterSnrm.parsed.dest)
        : profile.clientAddressWire
      await writeMeter(socket, buildHdlcUFrame(uaDest, uaSrc, HDLC_UA), "ua_after_meter_snrm")
      setInboundProtocolPhase("ua_sent_after_meter_snrm", "")
      accum = await extendAccum(socket, accum, profile, "after_ua_sent")
    } else if (
      profile.useBroadcastSnrmFirst &&
      profile.broadcastSnrm &&
      profile.broadcastSnrm.length > 0
    ) {
      setInboundProtocolPhase("broadcast_snrm_sent", "")
      await writeMeter(socket, profile.broadcastSnrm, "broadcast_snrm")
      accum = await extendAccum(socket, accum, profile, "after_broadcast_snrm")
    } else {
      setInboundProtocolPhase("targeted_snrm_sent", "")
      await writeMeter(socket, buildHdlcUFrame(meter, client, HDLC_SNRM), "targeted_snrm")
      accum = await extendAccum(socket, accum, profile, "after_targeted_snrm")
    }

    setInboundProtocolPhase("awaiting_ua", "")
    for (let i = 0; i < 8 && !hasStrictUaFrame(accum); i++) {
      traceProtocolStep("await_ua_burst", String(i))
      accum = await extendAccum(socket, accum, profile, `await_ua_${i}`)
    }
    if (!hasStrictUaFrame(accum)) {
      traceMeterAccumSnapshot(accum, "ua_missing_final")
      traceProtocolStep(
        "ua_missing",
        "no_strict_UA_FCS_ok_see_inboundProtocolTrace.inboundFrames"
      )
      setInboundProtocolPhase("ua_missing", "no verifiable HDLC UA after SNRM/broadcast")
      onIngressError("inbound_ua_missing")
      onSessionData(
        accum.length,
        Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
        "inbound_session_failed"
      )
      return
    }

    traceProtocolStep("ua_strict_ok", "proceeding_to_aarq")

    const uaLearned = findFirstStrictUaVariant(accum)
    if (uaLearned && uaLearned.parsed.control === HDLC_UA) {
      meter = Buffer.from(uaLearned.parsed.src)
      traceProtocolStep(
        "meter_hdlc_address_learned_from_ua",
        `${uaLearned.addressModel}:${meter.toString("hex")}`
      )
    }

    const aarq =
      profile.auth === "LOW" && profile.password
        ? buildAarqLlsLnPayload(profile.password)
        : buildAarqPayload()

    setInboundProtocolPhase("aarq_sent", "")
    setInboundAssociationOutcome({
      attempted: true,
      verifiedOnWire: false,
      resultEnum: null,
      aareApduHex: null,
    })

    const postAarqRxBoundary = accum.length
    const aarqBuilder: AarqBuilderKind =
      profile.auth === "LOW" && profile.password ? "LOW_LLS_LN" : "LN_MINIMAL_NO_AUTH"
    const aarqDiag = describeOutboundAarqPayload(aarq, aarqBuilder)
    traceOutboundAarqDiagnostic({
      ...aarqDiag,
      meterAddressHexForIframe: meter.toString("hex"),
      clientAddressHexForIframe: client.toString("hex"),
    })
    traceProtocolStep(
      "aarq_iframe_sent",
      `builder=${aarqBuilder}_meter=${meter.toString("hex")}_client=${client.toString("hex")}_llc_ref_ok=${String(aarqDiag.llcMatchesReference)}_pwd_wire_utf8_len=${aarqDiag.passwordUtf8ByteLength ?? "n/a"}`
    )
    await writeMeter(socket, buildHdlcIFrame(meter, client, HDLC_I_FRAME_FIRST, aarq), "aarq_iframe")
    accum = await extendAccum(socket, accum, profile, "after_aarq")
    traceAareHuntStep("after_aarq", accum, postAarqRxBoundary, postAarqRxBoundary)

    let aareHit = findAareInMeterAccum(accum, postAarqRxBoundary)
    for (let i = 0; i < 8 && !aareHit; i++) {
      const lenBeforeBurst = accum.length
      accum = await extendAccum(socket, accum, profile, `await_aare_${i}`)
      traceAareHuntStep(`await_aare_${i}`, accum, lenBeforeBurst, postAarqRxBoundary)
      aareHit = findAareInMeterAccum(accum, postAarqRxBoundary)
    }

    if (!aareHit) {
      const rep = buildAareSearchReport(accum, {
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
        accum.length,
        Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
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
        accum.length,
        Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
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
      accum.length,
      Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
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

    await writeMeter(socket, buildHdlcIFrame(meter, client, HDLC_I_FRAME_SECOND, getPdu), "identity_get")
    accum = await extendAccum(socket, accum, profile, "after_identity_get")

    let getHit = findGetResponse(accum)
    for (let i = 0; i < 8 && !getHit?.verified; i++) {
      accum = await extendAccum(socket, accum, profile, `await_get_${i}`)
      getHit = findGetResponse(accum)
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
        accum.length,
        Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
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
      accum.length,
      Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
      "inbound_identity_read_verified"
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setInboundProtocolPhase("session_error", msg)
    onIngressError(`inbound_session_error: ${msg}`)
    traceProtocolStep("session_error", msg)
    onSessionData(
      accum.length,
      Buffer.from(accum.subarray(0, Math.min(512, accum.length))),
      "inbound_session_failed"
    )
  } finally {
    traceMeterAccumSnapshot(accum, "session_finally")
    if (profile.sendDiscBeforeClose) {
      try {
        const disc = buildHdlcUFrame(meter, client, HDLC_DISC)
        traceOutboundFrame("disc_final", disc)
        traceProtocolStep("tx_disc_final", `${disc.length}B`)
        await writeAll(socket, disc)
        await readSocketBurst(
          socket,
          Math.max(300, profile.discDrainTimeoutMs),
          Math.min(150, profile.dlmsReadIdleMs)
        )
      } catch {
        /* best-effort */
      }
    }
    flushIngressTraceToFile("session_end")
    if (!socket.destroyed) socket.destroy()
  }
}
