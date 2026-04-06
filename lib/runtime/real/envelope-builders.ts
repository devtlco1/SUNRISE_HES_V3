import type {
  RuntimeCapabilityStage,
  RuntimeErrorInfo,
  RuntimeExecutionDiagnostics,
  RuntimeOperation,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export function timing(startedAt: Date, finishedAt: Date): {
  startedAt: string
  finishedAt: string
  durationMs: number
} {
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  }
}

export function buildRealEnvelope<T>(params: {
  operation: RuntimeOperation
  meterId: string
  startedAt: Date
  finishedAt: Date
  ok: boolean
  message: string
  transportState: RuntimeResponseEnvelope["transportState"]
  associationState: RuntimeResponseEnvelope["associationState"]
  diagnostics: RuntimeExecutionDiagnostics
  payload?: T
  error?: RuntimeErrorInfo
}): RuntimeResponseEnvelope<T> {
  const t = timing(params.startedAt, params.finishedAt)
  return {
    ok: params.ok,
    simulated: false,
    operation: params.operation,
    meterId: params.meterId,
    ...t,
    message: params.message,
    transportState: params.transportState,
    associationState: params.associationState,
    diagnostics: params.diagnostics,
    payload: params.payload,
    error: params.error,
  }
}

export function diagnosticsNotImplemented(
  stage: RuntimeCapabilityStage,
  detailCode: string
): RuntimeExecutionDiagnostics {
  return {
    outcome: "not_implemented",
    capabilityStage: stage,
    transportAttempted: false,
    associationAttempted: false,
    verifiedOnWire: false,
    detailCode,
  }
}

export function diagnosticsNotAttempted(
  stage: RuntimeCapabilityStage,
  detailCode: string
): RuntimeExecutionDiagnostics {
  return {
    outcome: "not_attempted",
    capabilityStage: stage,
    transportAttempted: false,
    associationAttempted: false,
    verifiedOnWire: false,
    detailCode,
  }
}

export function diagnosticsAttemptedFailed(
  stage: RuntimeCapabilityStage,
  detailCode: string,
  transportAttempted: boolean,
  associationAttempted: boolean
): RuntimeExecutionDiagnostics {
  return {
    outcome: "attempted_failed",
    capabilityStage: stage,
    transportAttempted,
    associationAttempted,
    verifiedOnWire: false,
    detailCode,
  }
}

export function diagnosticsTransportUnverified(
  detailCode: string
): RuntimeExecutionDiagnostics {
  return {
    outcome: "transport_reachable_unverified",
    capabilityStage: "transport_probe",
    transportAttempted: true,
    associationAttempted: false,
    verifiedOnWire: false,
    detailCode,
  }
}

/** AARE association-result accepted (0) after on-wire parse — use only with real proof. */
export function diagnosticsVerifiedAssociation(
  detailCode: string
): RuntimeExecutionDiagnostics {
  return {
    outcome: "verified_on_wire_success",
    capabilityStage: "dlms_association",
    transportAttempted: true,
    associationAttempted: true,
    verifiedOnWire: true,
    detailCode,
  }
}
