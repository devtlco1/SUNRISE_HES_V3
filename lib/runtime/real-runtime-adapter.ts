/**
 * Real smart-meter runtime adapter — **skeleton only**.
 *
 * Future DLMS/COSEM/HDLC (or other transport) logic should live in dedicated
 * modules and be called from this class once hardware integration begins.
 * This file must not open sockets or imply verified on-air execution until then.
 */

import type { SmartMeterRuntimeAdapter } from "@/lib/runtime/runtime-adapter"
import type {
  AssociatePayload,
  AssociateRequest,
  BasicRegistersPayload,
  ClockPayload,
  IdentityPayload,
  ProbeConnectionPayload,
  ProbeConnectionRequest,
  ReadBasicRegistersRequest,
  ReadClockRequest,
  ReadIdentityRequest,
  RelayDisconnectRequest,
  RelayReconnectRequest,
  RelaySimulatedPayload,
  RuntimeOperation,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export const REAL_ADAPTER_NOT_WIRED_CODE = "REAL_ADAPTER_NOT_WIRED"

export const REAL_ADAPTER_NOT_WIRED_MESSAGE =
  "DLMS/COSEM transport is not implemented in this repository revision. No socket session, association, or COSEM read was performed."

function skeletonNotWired<T>(
  operation: RuntimeOperation,
  meterId: string
): RuntimeResponseEnvelope<T> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return {
    ok: false,
    simulated: false,
    operation,
    meterId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    message: `Real runtime adapter (skeleton): ${REAL_ADAPTER_NOT_WIRED_MESSAGE}`,
    transportState: "disconnected",
    associationState: "none",
    error: {
      code: REAL_ADAPTER_NOT_WIRED_CODE,
      message: REAL_ADAPTER_NOT_WIRED_MESSAGE,
    },
  }
}

export class RealRuntimeAdapter implements SmartMeterRuntimeAdapter {
  probeConnection(
    request: ProbeConnectionRequest
  ): Promise<RuntimeResponseEnvelope<ProbeConnectionPayload>> {
    return Promise.resolve(skeletonNotWired("probeConnection", request.meterId))
  }

  associate(
    request: AssociateRequest
  ): Promise<RuntimeResponseEnvelope<AssociatePayload>> {
    return Promise.resolve(skeletonNotWired("associate", request.meterId))
  }

  readIdentity(
    request: ReadIdentityRequest
  ): Promise<RuntimeResponseEnvelope<IdentityPayload>> {
    return Promise.resolve(skeletonNotWired("readIdentity", request.meterId))
  }

  readClock(
    request: ReadClockRequest
  ): Promise<RuntimeResponseEnvelope<ClockPayload>> {
    return Promise.resolve(skeletonNotWired("readClock", request.meterId))
  }

  readBasicRegisters(
    request: ReadBasicRegistersRequest
  ): Promise<RuntimeResponseEnvelope<BasicRegistersPayload>> {
    return Promise.resolve(
      skeletonNotWired("readBasicRegisters", request.meterId)
    )
  }

  disconnectRelay(
    request: RelayDisconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>> {
    return Promise.resolve(skeletonNotWired("relayDisconnect", request.meterId))
  }

  reconnectRelay(
    request: RelayReconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>> {
    return Promise.resolve(skeletonNotWired("relayReconnect", request.meterId))
  }
}
