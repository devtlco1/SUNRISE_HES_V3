import type {
  AssociateRequest,
  AssociatePayload,
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

/**
 * Replaceable smart-meter runtime boundary.
 * Implementations may be stub/simulator or future real protocol (DLMS) adapters.
 * No Next.js or React types here.
 */
export interface SmartMeterRuntimeAdapter {
  probeConnection(
    request: ProbeConnectionRequest
  ): Promise<RuntimeResponseEnvelope<ProbeConnectionPayload>>

  associate(
    request: AssociateRequest
  ): Promise<RuntimeResponseEnvelope<AssociatePayload>>

  readIdentity(
    request: ReadIdentityRequest
  ): Promise<RuntimeResponseEnvelope<IdentityPayload>>

  readClock(
    request: ReadClockRequest
  ): Promise<RuntimeResponseEnvelope<ClockPayload>>

  readBasicRegisters(
    request: ReadBasicRegistersRequest
  ): Promise<RuntimeResponseEnvelope<BasicRegistersPayload>>

  disconnectRelay(
    request: RelayDisconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>>

  reconnectRelay(
    request: RelayReconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>>
}
