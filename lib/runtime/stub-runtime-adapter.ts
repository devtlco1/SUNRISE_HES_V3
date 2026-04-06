import simulatorFile from "@/data/runtime-simulator.json"
import {
  assertRuntimeSimulatorFile,
  type RuntimeSimulatorFile,
} from "@/lib/runtime/contracts"
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
  RuntimeExecutionDiagnostics,
  RuntimeOperation,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

const SIM_DATA: RuntimeSimulatorFile = assertRuntimeSimulatorFile(simulatorFile)

/** Deterministic duration from meter id + base (no RNG). Documented for tests. */
export function stubDurationMs(meterId: string, base: number): number {
  let s = 0
  for (let i = 0; i < meterId.length; i++) s += meterId.charCodeAt(i)
  return base + (s % 35)
}

/** Deterministic pseudo-token for simulated association (not a live security context). */
export function stubAssociationToken(meterId: string): string {
  let h = 0
  for (let i = 0; i < meterId.length; i++) {
    h = (h * 31 + meterId.charCodeAt(i)) >>> 0
  }
  return `SIM-ASSOC-${h.toString(16).padStart(8, "0")}`
}

function templateReplace(tpl: string, meterId: string): string {
  return tpl.split("{meterId}").join(meterId)
}

function mergeRegisters(
  base: Record<string, { value: string; unit?: string; quality?: string }>,
  extra?: Record<string, { value: string; unit?: string; quality?: string }>
): Record<string, { value: string; unit?: string; quality?: string }> {
  if (!extra) return { ...base }
  return { ...base, ...extra }
}

function overrideFor(meterId: string) {
  return SIM_DATA.meterOverrides?.[meterId]
}

async function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((r) => setTimeout(r, ms))
}

function stubDiagnostics(
  capabilityStage: RuntimeExecutionDiagnostics["capabilityStage"],
  transportAttempted: boolean,
  associationAttempted: boolean
): RuntimeExecutionDiagnostics {
  return {
    outcome: "simulated_success",
    capabilityStage,
    transportAttempted,
    associationAttempted,
    verifiedOnWire: false,
    detailCode: "STUB_SIMULATOR",
  }
}

function envelope<T>(
  operation: RuntimeOperation,
  meterId: string,
  startedAt: Date,
  finishedAt: Date,
  message: string,
  payload: T,
  diagnostics: RuntimeExecutionDiagnostics
): RuntimeResponseEnvelope<T> {
  const durationMs = finishedAt.getTime() - startedAt.getTime()
  return {
    ok: true,
    simulated: true,
    operation,
    meterId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    message,
    transportState: "connected",
    associationState: "associated",
    payload,
    diagnostics,
  }
}

/**
 * Deterministic stub: reads `data/runtime-simulator.json` only.
 * Every success sets `simulated: true` and uses explicit simulator wording in messages.
 */
export class StubRuntimeAdapter implements SmartMeterRuntimeAdapter {
  async probeConnection(
    request: ProbeConnectionRequest
  ): Promise<RuntimeResponseEnvelope<ProbeConnectionPayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const payload: ProbeConnectionPayload = {
      reachable: true,
      latencyMsSimulated: d,
      protocolStackHint: SIM_DATA.profile.protocolStackHint,
      probeKind: "simulator",
    }
    return envelope(
      "probeConnection",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated probe: target is reachable in the HES runtime stub only (no live transport).",
      payload,
      stubDiagnostics("transport_probe", true, false)
    )
  }

  async associate(
    request: AssociateRequest
  ): Promise<RuntimeResponseEnvelope<AssociatePayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase + 5)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const payload: AssociatePayload = {
      associationLevel: SIM_DATA.profile.associationLevel,
      securitySuite: SIM_DATA.profile.securitySuite,
      simulatedAssociationToken: stubAssociationToken(request.meterId),
    }
    return envelope(
      "associate",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated association: logical link modeled in software only (not a verified DLMS association).",
      payload,
      stubDiagnostics("dlms_association", true, true)
    )
  }

  async readIdentity(
    request: ReadIdentityRequest
  ): Promise<RuntimeResponseEnvelope<IdentityPayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const ov = overrideFor(request.meterId)
    const serial =
      ov?.serialNumber ??
      templateReplace(SIM_DATA.profile.serialNumberTemplate, request.meterId)
    const payload: IdentityPayload = {
      serialNumber: serial,
      manufacturer: ov?.manufacturer ?? SIM_DATA.profile.manufacturer,
      model: ov?.model ?? SIM_DATA.profile.model,
      firmwareVersion: ov?.firmwareVersion ?? SIM_DATA.profile.firmwareVersion,
      protocolVersion: SIM_DATA.profile.protocolVersion,
      logicalDeviceName: templateReplace(
        SIM_DATA.profile.logicalDeviceNameTemplate,
        request.meterId
      ),
    }
    return envelope(
      "readIdentity",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated identity read: values come from the runtime simulator dataset, not an on-air meter interrogation.",
      payload,
      stubDiagnostics("cosem_read", true, true)
    )
  }

  async readClock(
    request: ReadClockRequest
  ): Promise<RuntimeResponseEnvelope<ClockPayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const ov = overrideFor(request.meterId)
    const deviceTimeUtc = ov?.lastKnownClockUtc ?? SIM_DATA.profile.lastKnownClockUtc
    let skew = 0
    for (let i = 0; i < request.meterId.length; i++) {
      skew += request.meterId.charCodeAt(i)
    }
    const timeSkewMsEstimated = (skew % 121) - 60
    const payload: ClockPayload = {
      deviceTimeUtc,
      timeSkewMsEstimated,
    }
    return envelope(
      "readClock",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated clock read: timestamp is from simulator configuration (not synchronized with field hardware).",
      payload,
      stubDiagnostics("cosem_read", true, true)
    )
  }

  async readBasicRegisters(
    request: ReadBasicRegistersRequest
  ): Promise<RuntimeResponseEnvelope<BasicRegistersPayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase + 3)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const ov = overrideFor(request.meterId)
    const registers = mergeRegisters(SIM_DATA.profile.basicRegisters, ov?.basicRegisters)
    const payload: BasicRegistersPayload = { registers }
    return envelope(
      "readBasicRegisters",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated register snapshot: OBIS keys and values are fixture-backed for contract testing only.",
      payload,
      stubDiagnostics("cosem_read", true, true)
    )
  }

  async disconnectRelay(
    request: RelayDisconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase + 8)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const payload: RelaySimulatedPayload = {
      simulatedRelayState: "disconnected",
      acceptanceNote:
        "Simulated disconnect acceptance: no physical service disconnect or relay armature was commanded by this stub.",
    }
    return envelope(
      "relayDisconnect",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated relay disconnect workflow completed in software only (no execution on meter hardware).",
      payload,
      stubDiagnostics("relay_control", true, true)
    )
  }

  async reconnectRelay(
    request: RelayReconnectRequest
  ): Promise<RuntimeResponseEnvelope<RelaySimulatedPayload>> {
    const startedAt = new Date()
    const d = stubDurationMs(request.meterId, SIM_DATA.profile.latencyMsSimulatedBase + 8)
    await delayMs(Math.min(d, 50))
    const finishedAt = new Date()
    const payload: RelaySimulatedPayload = {
      simulatedRelayState: "connected",
      acceptanceNote:
        "Simulated reconnect acceptance: no physical re-energization or relay closure was performed by this stub.",
    }
    return envelope(
      "relayReconnect",
      request.meterId,
      startedAt,
      finishedAt,
      "Simulated relay reconnect workflow completed in software only (no execution on meter hardware).",
      payload,
      stubDiagnostics("relay_control", true, true)
    )
  }
}
