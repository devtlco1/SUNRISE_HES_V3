import {
  REAL_PROBE_CONFIG_INVALID,
  REAL_PROBE_TARGET_NOT_CONFIGURED,
} from "@/lib/runtime/real/real-adapter-codes"
import {
  buildRealEnvelope,
  diagnosticsAttemptedFailed,
  diagnosticsNotAttempted,
  diagnosticsTransportUnverified,
} from "@/lib/runtime/real/envelope-builders"
import { loadTcpProbeConfig } from "@/lib/runtime/real/transport-config"
import { tcpConnectProbe } from "@/lib/runtime/real/tcp-probe"
import type {
  ProbeConnectionPayload,
  ProbeConnectionRequest,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

const TCP_UNVERIFIED_DETAIL = "TCP_REACHABLE_DLMS_NOT_VERIFIED"

/**
 * Real-adapter probe: optional TCP socket check only when RUNTIME_PROBE_* is set.
 * Never claims DLMS, association, or meter identity.
 */
export async function realProbeConnection(
  request: ProbeConnectionRequest
): Promise<RuntimeResponseEnvelope<ProbeConnectionPayload>> {
  const startedAt = new Date()
  const cfg = loadTcpProbeConfig()

  if (!cfg.ok) {
    const finishedAt = new Date()
    const isUnset = cfg.code === "PROBE_TARGET_NOT_CONFIGURED"
    return buildRealEnvelope<ProbeConnectionPayload>({
      operation: "probeConnection",
      meterId: request.meterId,
      startedAt,
      finishedAt,
      ok: false,
      message: cfg.message,
      transportState: "disconnected",
      associationState: "none",
      diagnostics: isUnset
        ? diagnosticsNotAttempted(
            "transport_probe",
            REAL_PROBE_TARGET_NOT_CONFIGURED
          )
        : diagnosticsNotAttempted("configuration", REAL_PROBE_CONFIG_INVALID),
      error: { code: cfg.code, message: cfg.message },
      payload: {
        reachable: false,
        protocolStackHint:
          "No TCP probe executed. Configure RUNTIME_PROBE_HOST and RUNTIME_PROBE_PORT for optional socket reachability (not DLMS).",
        probeKind: "none",
      },
    })
  }

  const tcp = await tcpConnectProbe(cfg.host, cfg.port, cfg.timeoutMs)
  const finishedAt = new Date()

  if (!tcp.ok) {
    return buildRealEnvelope<ProbeConnectionPayload>({
      operation: "probeConnection",
      meterId: request.meterId,
      startedAt,
      finishedAt,
      ok: false,
      message: `TCP probe failed: ${tcp.message} (DLMS/COSEM not attempted; meter not verified).`,
      transportState: "error",
      associationState: "none",
      diagnostics: diagnosticsAttemptedFailed(
        "transport_probe",
        tcp.code,
        true,
        false
      ),
      error: { code: tcp.code, message: tcp.message },
      payload: {
        reachable: false,
        protocolStackHint:
          "TCP socket only; no HDLC/DLMS framing or COSEM application association was performed.",
        probeKind: "tcp_socket",
        roundTripMs: tcp.roundTripMs,
        remoteHost: cfg.host,
        remotePort: cfg.port,
      },
    })
  }

  return buildRealEnvelope<ProbeConnectionPayload>({
    operation: "probeConnection",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: true,
    message: `TCP connect succeeded to ${cfg.host}:${cfg.port} in ${tcp.roundTripMs}ms. This does not verify DLMS, association, or that a smart meter answered.`,
    transportState: "connected",
    associationState: "none",
    diagnostics: diagnosticsTransportUnverified(TCP_UNVERIFIED_DETAIL),
    payload: {
      reachable: true,
      protocolStackHint:
        "TCP socket reachability only. No DLMS/HDLC SNRM, no application association, no COSEM.",
      probeKind: "tcp_socket",
      roundTripMs: tcp.roundTripMs,
      remoteHost: cfg.host,
      remotePort: cfg.port,
    },
  })
}
