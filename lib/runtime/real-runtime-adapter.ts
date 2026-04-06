/**
 * Real smart-meter runtime adapter — **staged implementation**.
 *
 * - Probe: optional TCP socket check when RUNTIME_PROBE_HOST/PORT are set (not DLMS).
 * - Association / COSEM reads / relay: explicit not-implemented envelopes with diagnostics.
 *
 * Future DLMS/HDLC/COSEM logic should live under `lib/runtime/real/` and be called from here.
 */

import { runRealAssociate } from "@/lib/runtime/real/association-stage"
import {
  readBasicRegistersNotImplemented,
  readClockNotImplemented,
  readIdentityNotImplemented,
} from "@/lib/runtime/real/cosem-reads-stage"
import { realProbeConnection } from "@/lib/runtime/real/probe-connection"
import {
  disconnectRelayNotImplemented,
  reconnectRelayNotImplemented,
} from "@/lib/runtime/real/relay-stage"
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
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export class RealRuntimeAdapter implements SmartMeterRuntimeAdapter {
  probeConnection(
    request: ProbeConnectionRequest
  ): Promise<RuntimeResponseEnvelope<ProbeConnectionPayload>> {
    return realProbeConnection(request)
  }

  associate(
    request: AssociateRequest
  ): Promise<RuntimeResponseEnvelope<AssociatePayload>> {
    return runRealAssociate(request)
  }

  readIdentity(
    request: ReadIdentityRequest
  ): Promise<RuntimeResponseEnvelope<IdentityPayload>> {
    return Promise.resolve(readIdentityNotImplemented(request))
  }

  readClock(
    request: ReadClockRequest
  ): Promise<RuntimeResponseEnvelope<ClockPayload>> {
    return Promise.resolve(readClockNotImplemented(request))
  }

  readBasicRegisters(
    request: ReadBasicRegistersRequest
  ): Promise<RuntimeResponseEnvelope<BasicRegistersPayload>> {
    return Promise.resolve(readBasicRegistersNotImplemented(request))
  }

  disconnectRelay(
    request: RelayDisconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>> {
    return Promise.resolve(disconnectRelayNotImplemented(request))
  }

  reconnectRelay(
    request: RelayReconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>> {
    return Promise.resolve(reconnectRelayNotImplemented(request))
  }
}
