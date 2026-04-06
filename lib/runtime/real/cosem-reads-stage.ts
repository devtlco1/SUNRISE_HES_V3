/**
 * COSEM read stage (identity, clock, registers) — real adapter placeholders.
 * Wire actual GET/READ services here only after association exists.
 */

import {
  REAL_READ_CLOCK_NOT_IMPLEMENTED,
  REAL_READ_IDENTITY_NOT_IMPLEMENTED,
  REAL_READ_REGISTERS_NOT_IMPLEMENTED,
} from "@/lib/runtime/real/real-adapter-codes"
import {
  buildRealEnvelope,
  diagnosticsNotImplemented,
} from "@/lib/runtime/real/envelope-builders"
import type {
  BasicRegistersPayload,
  ClockPayload,
  IdentityPayload,
  ReadBasicRegistersRequest,
  ReadClockRequest,
  ReadIdentityRequest,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

const READ_MSG =
  "COSEM read path not implemented. No live meter data was requested on the wire."

export function readIdentityNotImplemented(
  request: ReadIdentityRequest
): RuntimeResponseEnvelope<IdentityPayload> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return buildRealEnvelope<IdentityPayload>({
    operation: "readIdentity",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: false,
    message: READ_MSG,
    transportState: "disconnected",
    associationState: "none",
    diagnostics: diagnosticsNotImplemented(
      "cosem_read",
      REAL_READ_IDENTITY_NOT_IMPLEMENTED
    ),
    error: {
      code: REAL_READ_IDENTITY_NOT_IMPLEMENTED,
      message: READ_MSG,
    },
  })
}

export function readClockNotImplemented(
  request: ReadClockRequest
): RuntimeResponseEnvelope<ClockPayload> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return buildRealEnvelope<ClockPayload>({
    operation: "readClock",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: false,
    message: READ_MSG,
    transportState: "disconnected",
    associationState: "none",
    diagnostics: diagnosticsNotImplemented(
      "cosem_read",
      REAL_READ_CLOCK_NOT_IMPLEMENTED
    ),
    error: {
      code: REAL_READ_CLOCK_NOT_IMPLEMENTED,
      message: READ_MSG,
    },
  })
}

export function readBasicRegistersNotImplemented(
  request: ReadBasicRegistersRequest
): RuntimeResponseEnvelope<BasicRegistersPayload> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return buildRealEnvelope<BasicRegistersPayload>({
    operation: "readBasicRegisters",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: false,
    message: READ_MSG,
    transportState: "disconnected",
    associationState: "none",
    diagnostics: diagnosticsNotImplemented(
      "cosem_read",
      REAL_READ_REGISTERS_NOT_IMPLEMENTED
    ),
    error: {
      code: REAL_READ_REGISTERS_NOT_IMPLEMENTED,
      message: READ_MSG,
    },
  })
}
