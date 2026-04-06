import type { RuntimeTargetRequest } from "@/types/runtime"

/** Non-empty trimmed meter id pattern (operational id, not necessarily serial). */
const METER_ID_PATTERN = /^[\w.-]{1,128}$/

export function isValidMeterId(value: unknown): value is string {
  return typeof value === "string" && METER_ID_PATTERN.test(value.trim())
}

/**
 * Parse and validate a JSON body for POST routes that target a single meter.
 * Returns null if the shape is invalid (caller should respond 400).
 */
export function parseRuntimeTargetBody(body: unknown): RuntimeTargetRequest | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null
  }
  const o = body as Record<string, unknown>
  const meterId = o.meterId
  if (!isValidMeterId(meterId)) {
    return null
  }
  const endpointId = o.endpointId
  const channelHint = o.channelHint
  const req: RuntimeTargetRequest = { meterId: meterId.trim() }
  if (endpointId !== undefined) {
    if (typeof endpointId !== "string" || endpointId.length > 256) {
      return null
    }
    req.endpointId = endpointId
  }
  if (channelHint !== undefined) {
    if (typeof channelHint !== "string" || channelHint.length > 256) {
      return null
    }
    req.channelHint = channelHint
  }
  return req
}

export interface RuntimeSimulatorRegister {
  value: string
  unit?: string
  quality?: string
}

/** Shape of `data/runtime-simulator.json` (stub-only). */
export interface RuntimeSimulatorFile {
  simulatorVersion: string
  profile: {
    manufacturer: string
    model: string
    firmwareVersion: string
    protocolVersion: string
    serialNumberTemplate: string
    logicalDeviceNameTemplate: string
    protocolStackHint: string
    associationLevel: string
    securitySuite: string
    lastKnownClockUtc: string
    connectivityPlaceholder: string
    latencyMsSimulatedBase: number
    basicRegisters: Record<string, RuntimeSimulatorRegister>
    defaultRelaySimulatedState: "disconnected" | "connected" | "unknown"
  }
  /**
   * Optional per-meter overrides keyed by operational meter id (e.g. registry id).
   * Merged over `profile` for identity/registers/relay where provided.
   */
  meterOverrides?: Record<
    string,
    Partial<{
      serialNumber: string
      manufacturer: string
      model: string
      firmwareVersion: string
      lastKnownClockUtc: string
      basicRegisters: Record<string, RuntimeSimulatorRegister>
      relaySimulatedState: "disconnected" | "connected" | "unknown"
    }>
  >
}

export function assertRuntimeSimulatorFile(data: unknown): RuntimeSimulatorFile {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("RUNTIME_SIMULATOR_INVALID_ROOT")
  }
  const root = data as Record<string, unknown>
  if (typeof root.simulatorVersion !== "string" || typeof root.profile !== "object") {
    throw new Error("RUNTIME_SIMULATOR_INVALID_SHAPE")
  }
  return data as RuntimeSimulatorFile
}
