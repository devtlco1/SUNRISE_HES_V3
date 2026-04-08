import {
  parseTcpListenerStagedSessions,
  pickSessionForMeter,
} from "@/lib/connectivity/phase1-aggregate"
import {
  getTcpListenerStatusFromSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"

/**
 * How the command engine should reach a meter on the Python runtime.
 * Inbound modems use staged TCP listener sockets; direct uses outbound serial/TCP client.
 */
export type CommandMeterTransport =
  | { kind: "tcp_listener"; reason: "bound_inbound_session" }
  | { kind: "direct"; reason: "no_bound_inbound_session" | "listener_status_unavailable" }
  | {
      kind: "blocked"
      reason: "inbound_pending_bind"
      message: string
    }

/**
 * Resolve transport using the same staged-session rules as connectivity Phase 1.
 * - Bound inbound session (canonical serial, not pending) → tcp_listener relay/read paths.
 * - Pending bind only → blocked (operator must finish Scanner identity).
 * - No session / listener errors → direct (serial / configured client TCP only).
 */
export async function resolveCommandMeterTransport(
  meterSerial: string
): Promise<CommandMeterTransport> {
  const serial = meterSerial.trim()
  if (!serial) {
    return { kind: "direct", reason: "no_bound_inbound_session" }
  }
  try {
    const status = (await getTcpListenerStatusFromSidecar()) as Record<
      string,
      unknown
    >
    const sessions = parseTcpListenerStagedSessions(status)
    const sess = pickSessionForMeter(serial, sessions)
    if (sess?.pendingBind) {
      return {
        kind: "blocked",
        reason: "inbound_pending_bind",
        message:
          "Inbound modem session exists but meter is not bound yet — complete identity in Scanner before commands.",
      }
    }
    if (sess) {
      return { kind: "tcp_listener", reason: "bound_inbound_session" }
    }
    return { kind: "direct", reason: "no_bound_inbound_session" }
  } catch (e) {
    if (e instanceof PythonSidecarNotConfiguredError) {
      throw e
    }
    if (e instanceof PythonSidecarHttpError) {
      return { kind: "direct", reason: "listener_status_unavailable" }
    }
    return { kind: "direct", reason: "listener_status_unavailable" }
  }
}
