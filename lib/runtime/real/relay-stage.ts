/**
 * Relay control stage — intentionally not implemented until reads/association are proven.
 */

import {
  REAL_RELAY_DISCONNECT_NOT_IMPLEMENTED,
  REAL_RELAY_RECONNECT_NOT_IMPLEMENTED,
} from "@/lib/runtime/real/real-adapter-codes"
import {
  buildRealEnvelope,
  diagnosticsNotImplemented,
} from "@/lib/runtime/real/envelope-builders"
import type {
  RelayDisconnectRequest,
  RelayReconnectRequest,
  RelaySimulatedPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

const RELAY_MSG =
  "Physical relay / service disconnect control is not implemented in the real adapter. No command was sent to hardware."

export function disconnectRelayNotImplemented(
  request: RelayDisconnectRequest
): RuntimeResponseEnvelope<RelaySimulatedPayload> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return buildRealEnvelope<RelaySimulatedPayload>({
    operation: "relayDisconnect",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: false,
    message: RELAY_MSG,
    transportState: "disconnected",
    associationState: "none",
    diagnostics: diagnosticsNotImplemented(
      "relay_control",
      REAL_RELAY_DISCONNECT_NOT_IMPLEMENTED
    ),
    error: {
      code: REAL_RELAY_DISCONNECT_NOT_IMPLEMENTED,
      message: RELAY_MSG,
    },
  })
}

export function reconnectRelayNotImplemented(
  request: RelayReconnectRequest
): RuntimeResponseEnvelope<RelaySimulatedPayload> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return buildRealEnvelope<RelaySimulatedPayload>({
    operation: "relayReconnect",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: false,
    message: RELAY_MSG,
    transportState: "disconnected",
    associationState: "none",
    diagnostics: diagnosticsNotImplemented(
      "relay_control",
      REAL_RELAY_RECONNECT_NOT_IMPLEMENTED
    ),
    error: {
      code: REAL_RELAY_RECONNECT_NOT_IMPLEMENTED,
      message: RELAY_MSG,
    },
  })
}
