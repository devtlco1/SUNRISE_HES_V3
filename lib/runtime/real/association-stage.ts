/**
 * DLMS application association over HDLC on TCP (opt-in via RUNTIME_PROBE_* + HDLC env).
 * verifiedOnWire is set only when a valid AARE is parsed with association-result enum 0 (accepted).
 */

import {
  REAL_ASSOCIATION_AARE_MISSING,
  REAL_ASSOCIATION_AARE_REJECTED,
  REAL_ASSOCIATION_AARE_VERIFIED,
  REAL_ASSOCIATION_AARQ_NO_RESPONSE,
  REAL_ASSOCIATION_HDLC_CONFIG_INVALID,
  REAL_ASSOCIATION_TCP_ERROR,
  REAL_ASSOCIATION_UA_INVALID,
  REAL_ASSOCIATION_UA_NOT_RECEIVED,
  REAL_PROBE_CONFIG_INVALID,
  REAL_PROBE_TARGET_NOT_CONFIGURED,
} from "@/lib/runtime/real/real-adapter-codes"
import {
  apduToHex,
  buildAarqPayload,
  parseAareAssociationResult,
  stripLeadingLlcReply,
} from "@/lib/runtime/real/dlms-apdu"
import {
  readSocketBurst,
  withTcpSocket,
  writeAll,
} from "@/lib/runtime/real/dlms-transport-session"
import {
  buildRealEnvelope,
  diagnosticsAttemptedFailed,
  diagnosticsNotAttempted,
  diagnosticsVerifiedAssociation,
} from "@/lib/runtime/real/envelope-builders"
import {
  buildDiscFrame,
  buildIframe,
  buildSnrmFrame,
  HDLC_I_FRAME_FIRST,
  HDLC_UA,
  parseHdlcFrame,
  splitHdlcFrames,
} from "@/lib/runtime/real/hdlc-frame"
import { loadTcpProbeConfig } from "@/lib/runtime/real/transport-config"
import type {
  AssociatePayload,
  AssociateRequest,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

function loadDlmsHdlcLogicalAddresses():
  | { ok: true; serverLogical: number; clientLogical: number }
  | { ok: false; message: string } {
  const s = Number.parseInt(
    process.env.RUNTIME_DLMS_HDLC_SERVER_LOGICAL ?? "1",
    10
  )
  const c = Number.parseInt(
    process.env.RUNTIME_DLMS_HDLC_CLIENT_LOGICAL ?? "16",
    10
  )
  if (!Number.isFinite(s) || s < 0 || s >= 0x80) {
    return {
      ok: false,
      message: `Invalid RUNTIME_DLMS_HDLC_SERVER_LOGICAL (0–127): ${process.env.RUNTIME_DLMS_HDLC_SERVER_LOGICAL}`,
    }
  }
  if (!Number.isFinite(c) || c < 0 || c >= 0x80) {
    return {
      ok: false,
      message: `Invalid RUNTIME_DLMS_HDLC_CLIENT_LOGICAL (0–127): ${process.env.RUNTIME_DLMS_HDLC_CLIENT_LOGICAL}`,
    }
  }
  return { ok: true, serverLogical: s, clientLogical: c }
}

function readTiming(): { maxWaitMs: number; idleMs: number } {
  const max = Number.parseInt(process.env.RUNTIME_DLMS_READ_MAX_MS ?? "", 10)
  const idle = Number.parseInt(process.env.RUNTIME_DLMS_READ_IDLE_MS ?? "", 10)
  return {
    maxWaitMs: Number.isFinite(max) && max >= 300 ? max : 12_000,
    idleMs: Number.isFinite(idle) && idle >= 50 ? idle : 400,
  }
}

function findUa(accumulated: Uint8Array): boolean {
  for (const raw of splitHdlcFrames(accumulated)) {
    const p = parseHdlcFrame(raw)
    if (p?.kind === "u" && p.control === HDLC_UA) return true
  }
  return false
}

function findAareInAccumulated(
  accumulated: Uint8Array
): { apdu: Uint8Array; result: number } | null {
  for (const raw of splitHdlcFrames(accumulated)) {
    const p = parseHdlcFrame(raw)
    if (p?.kind !== "i") continue
    const apdu = stripLeadingLlcReply(p.llcAndApdu)
    const parsed = parseAareAssociationResult(apdu)
    if (parsed) {
      return { apdu, result: parsed.result }
    }
  }
  return null
}

export async function runRealAssociate(
  request: AssociateRequest
): Promise<RuntimeResponseEnvelope<AssociatePayload>> {
  const startedAt = new Date()
  const tcpCfg = loadTcpProbeConfig()
  if (!tcpCfg.ok) {
    const finishedAt = new Date()
    const isUnset = tcpCfg.code === "PROBE_TARGET_NOT_CONFIGURED"
    return buildRealEnvelope<AssociatePayload>({
      operation: "associate",
      meterId: request.meterId,
      startedAt,
      finishedAt,
      ok: false,
      message: tcpCfg.message,
      transportState: "disconnected",
      associationState: "none",
      diagnostics: isUnset
        ? diagnosticsNotAttempted(
            "dlms_association",
            REAL_PROBE_TARGET_NOT_CONFIGURED
          )
        : diagnosticsNotAttempted("configuration", REAL_PROBE_CONFIG_INVALID),
      error: { code: tcpCfg.code, message: tcpCfg.message },
    })
  }

  const hdlc = loadDlmsHdlcLogicalAddresses()
  if (!hdlc.ok) {
    const finishedAt = new Date()
    return buildRealEnvelope<AssociatePayload>({
      operation: "associate",
      meterId: request.meterId,
      startedAt,
      finishedAt,
      ok: false,
      message: hdlc.message,
      transportState: "disconnected",
      associationState: "none",
      diagnostics: diagnosticsNotAttempted(
        "configuration",
        REAL_ASSOCIATION_HDLC_CONFIG_INVALID
      ),
      error: {
        code: REAL_ASSOCIATION_HDLC_CONFIG_INVALID,
        message: hdlc.message,
      },
    })
  }

  const { maxWaitMs, idleMs } = readTiming()

  try {
    return await withTcpSocket(
      tcpCfg.host,
      tcpCfg.port,
      tcpCfg.timeoutMs,
      async (sock) => {
        try {
          await writeAll(
            sock,
            buildSnrmFrame(hdlc.serverLogical, hdlc.clientLogical)
          )
          const burst1 = await readSocketBurst(sock, maxWaitMs, idleMs)
          if (!findUa(new Uint8Array(burst1))) {
            const finishedAt = new Date()
            return buildRealEnvelope<AssociatePayload>({
              operation: "associate",
              meterId: request.meterId,
              startedAt,
              finishedAt,
              ok: false,
              message:
                "No valid HDLC UA response after SNRM (wrong address, non-DLMS peer, or parse/CRC failure).",
              transportState: "error",
              associationState: "failed",
              diagnostics: diagnosticsAttemptedFailed(
                "dlms_association",
                burst1.length === 0
                  ? REAL_ASSOCIATION_UA_NOT_RECEIVED
                  : REAL_ASSOCIATION_UA_INVALID,
                true,
                true
              ),
              error: {
                code:
                  burst1.length === 0
                    ? REAL_ASSOCIATION_UA_NOT_RECEIVED
                    : REAL_ASSOCIATION_UA_INVALID,
                message:
                  "SNRM/UA handshake did not yield a verifiable UA frame.",
                details: { bytesReceived: burst1.length },
              },
            })
          }

          await writeAll(
            sock,
            buildIframe(
              hdlc.serverLogical,
              hdlc.clientLogical,
              HDLC_I_FRAME_FIRST,
              buildAarqPayload()
            )
          )
          const burst2 = await readSocketBurst(sock, maxWaitMs, idleMs)
          if (burst2.length === 0) {
            const finishedAt = new Date()
            return buildRealEnvelope<AssociatePayload>({
              operation: "associate",
              meterId: request.meterId,
              startedAt,
              finishedAt,
              ok: false,
              message: "No response bytes after AARQ.",
              transportState: "connected",
              associationState: "failed",
              diagnostics: diagnosticsAttemptedFailed(
                "dlms_association",
                REAL_ASSOCIATION_AARQ_NO_RESPONSE,
                true,
                true
              ),
              error: {
                code: REAL_ASSOCIATION_AARQ_NO_RESPONSE,
                message: "Timed out or idle-closed read after AARQ.",
              },
            })
          }

          const aareHit = findAareInAccumulated(new Uint8Array(burst2))
          const finishedAt = new Date()
          if (!aareHit) {
            return buildRealEnvelope<AssociatePayload>({
              operation: "associate",
              meterId: request.meterId,
              startedAt,
              finishedAt,
              ok: false,
              message:
                "Response did not contain a parseable AARE with association-result (wrong profile, encryption required, or framing mismatch).",
              transportState: "connected",
              associationState: "failed",
              diagnostics: diagnosticsAttemptedFailed(
                "dlms_association",
                REAL_ASSOCIATION_AARE_MISSING,
                true,
                true
              ),
              error: {
                code: REAL_ASSOCIATION_AARE_MISSING,
                message:
                  "Could not locate AARE tag 0x61 and association-result (0xA2…).",
                details: { bytesReceived: burst2.length },
              },
            })
          }

          if (aareHit.result !== 0) {
            return buildRealEnvelope<AssociatePayload>({
              operation: "associate",
              meterId: request.meterId,
              startedAt,
              finishedAt,
              ok: false,
              message: `AARE association-result on wire is ${aareHit.result} (0=accepted). Association rejected or not accepted.`,
              transportState: "connected",
              associationState: "failed",
              diagnostics: diagnosticsAttemptedFailed(
                "dlms_association",
                REAL_ASSOCIATION_AARE_REJECTED,
                true,
                true
              ),
              error: {
                code: REAL_ASSOCIATION_AARE_REJECTED,
                message: `association-result=${aareHit.result}`,
                details: { associationResult: aareHit.result },
              },
              payload: {
                associationLevel: "DLMS AARE received — association not accepted",
                securitySuite:
                  "Emitted AARQ uses no dedicated security; meter may require auth/ciphering.",
                linkChannel: "hdlc_tcp",
                aareAssociationResult: aareHit.result,
                aareApduHex: apduToHex(aareHit.apdu),
                hdlcServerAddress: hdlc.serverLogical,
                hdlcClientAddress: hdlc.clientLogical,
              },
            })
          }

          return buildRealEnvelope<AssociatePayload>({
            operation: "associate",
            meterId: request.meterId,
            startedAt,
            finishedAt,
            ok: true,
            message:
              "AARE parsed on wire: association-result=0 (accepted). No COSEM reads performed; session closed with DISC.",
            transportState: "connected",
            associationState: "associated",
            diagnostics: diagnosticsVerifiedAssociation(
              REAL_ASSOCIATION_AARE_VERIFIED
            ),
            payload: {
              associationLevel:
                "COSEM / DLMS logical name (LN) — AARE association-result accepted (0)",
              securitySuite:
                "No dedicated security in emitted AARQ (lab / open association only; not for production without policy).",
              linkChannel: "hdlc_tcp",
              aareAssociationResult: 0,
              aareApduHex: apduToHex(aareHit.apdu),
              hdlcServerAddress: hdlc.serverLogical,
              hdlcClientAddress: hdlc.clientLogical,
            },
          })
        } finally {
          try {
            await writeAll(
              sock,
              buildDiscFrame(hdlc.serverLogical, hdlc.clientLogical)
            )
            await readSocketBurst(sock, Math.min(maxWaitMs, 3000), 150)
          } catch {
            /* best-effort link teardown */
          }
        }
      }
    )
  } catch (e) {
    const finishedAt = new Date()
    const msg = e instanceof Error ? e.message : String(e)
    return buildRealEnvelope<AssociatePayload>({
      operation: "associate",
      meterId: request.meterId,
      startedAt,
      finishedAt,
      ok: false,
      message: `DLMS association transport error: ${msg}`,
      transportState: "error",
      associationState: "none",
      diagnostics: diagnosticsAttemptedFailed(
        "dlms_association",
        REAL_ASSOCIATION_TCP_ERROR,
        true,
        false
      ),
      error: { code: REAL_ASSOCIATION_TCP_ERROR, message: msg },
    })
  }
}
