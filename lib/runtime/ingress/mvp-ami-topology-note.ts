import type { IngressMvpAmiTopologyComparisonPublic } from "@/lib/runtime/ingress/types"

/**
 * Static, evidence-based comparison of MVP-AMI (`devtlco1/MVP-AMI`) vs SUNRISE inbound ingress.
 * Not derived from live sockets — operators should still read `inboundProtocolTrace` for session facts.
 *
 * Sources: MVP-AMI `meter_client.py` (`open_serial`, `run_phase1`, `run_phase1_tcp_socket`),
 * `api_server.py` (`/api/read-tcp`, `_tcp_conn`, TCP listener thread), `config.py` (`TcpListenConfig`).
 */
export const INGRESS_MVP_AMI_TOPOLOGY_COMPARISON: IngressMvpAmiTopologyComparisonPublic =
  {
    transportEquivalenceAssessment: "not_equivalent",
    summary:
      "MVP-AMI’s primary documented read path opens a local serial port from the host (pyserial); " +
      "TCP ingress in MVP-AMI is an optional Stage-8 POC that accepts a client socket but only runs " +
      "IEC+DLMS when an operator calls /api/read-tcp. SUNRISE runs an automatic DLMS state machine " +
      "immediately on accept. These are materially different session triggers and ordering assumptions.",
    mvpAmiDocumentedReadPath:
      "Serial: host opens COM (`MeterClient.open_serial`), host-driven IEC/DLMS timing; " +
      "Gurux legacy path sends SNRM from host (`_attempt_gurux_association`). " +
      "Vendor broadcast path sends broadcast SNRM from host then reads UA (`_attempt_vendor_broadcast_association`).",
    mvpAmiTcpListenerPocBehavior:
      "Python TCP server accepts modem; socket stored in `_tcp_conn` until POST /api/read-tcp; " +
      "then `run_phase1_tcp_socket` runs IEC over TCP (`/?!`, server-sent ACK candidates), sleep, " +
      "then same association strategies using `SocketSerialAdapter` — socket not auto-driven at accept time.",
    sunriseIngressBehavior:
      "Node TCP server accepts; `runInboundDlmsOnSocket` runs immediately: optional IEC preamble match, " +
      "then either answer meter-originated SNRM with UA or send broadcast/targeted SNRM, then AARQ, etc.; " +
      "teardown includes server DISC when configured (`socketCloseDiagnostic` records close origin).",
    concreteDifferences: [
      "Primary MVP-AMI success evidence in repo artifacts is serial (`/dev/cu.*`), not the TCP listener POC.",
      "MVP-AMI TCP: DLMS starts only after an explicit API read — not on `accept()` alone.",
      "MVP-AMI TCP: mandatory IEC identification/ACK phase (`_run_iec_handshake_tcp`) before association; ingress matches IEC only if bytes align with configured ACK candidates (may differ in timing/order).",
      "When the meter sends SNRM first on ingress, the server acts as HDLC responder for that step; MVP-AMI vendor broadcast path sends SNRM from the host first on a quiet transport — different role ordering.",
      "Gurux usage is shared at the APDU level, but framing/read scheduling and who owns the next TX after TCP connect differ.",
    ],
    liveVpsEvidenceAnchor:
      "Strict UA OK, AARQ APDU aligned with Gurux, post-AARQ zero RX, `closeOrigin=closed_after_disc_final`, " +
      "`peerClosedBeforeServerTeardown=false` — the meter did not answer AARE; server closed after its teardown. " +
      "That does not prove the inbound association model matches the MVP-AMI session that succeeded elsewhere.",
    associationAssumptionStillWorthTesting:
      true,
    recommendedNextDirection:
      "Treat MVP-AMI TCP POC (`run_phase1_tcp_socket` + /api/read-tcp) as the closest comparator: same TCP accept " +
      "topology but different trigger — consider an API- or job-triggered session on the accepted socket, " +
      "or a small sidecar service that reuses MVP-AMI’s exact IEC-then-DLMS order; alternatively validate " +
      "the same meter on MVP-AMI serial vs this TCP ingress to isolate transport vs role. " +
      "Avoid assuming byte-identical AARQ implies identical session validity across these modes.",
  }
