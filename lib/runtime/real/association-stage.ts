/**
 * DLMS / application association stage for the real adapter.
 * Next implementation milestone: HDLC + AARQ/AARE (or stack equivalent) here.
 */

import { REAL_ASSOCIATION_NOT_IMPLEMENTED } from "@/lib/runtime/real/real-adapter-codes"
import {
  buildRealEnvelope,
  diagnosticsNotImplemented,
} from "@/lib/runtime/real/envelope-builders"
import type {
  AssociatePayload,
  AssociateRequest,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

const STAGE_MESSAGE =
  "DLMS application association is not implemented in this revision. No AARQ/AARE, no security context, no on-wire association attempted."

export function associateNotImplemented(
  request: AssociateRequest
): RuntimeResponseEnvelope<AssociatePayload> {
  const startedAt = new Date()
  const finishedAt = new Date()
  return buildRealEnvelope<AssociatePayload>({
    operation: "associate",
    meterId: request.meterId,
    startedAt,
    finishedAt,
    ok: false,
    message: STAGE_MESSAGE,
    transportState: "disconnected",
    associationState: "none",
    diagnostics: diagnosticsNotImplemented(
      "dlms_association",
      REAL_ASSOCIATION_NOT_IMPLEMENTED
    ),
    error: {
      code: REAL_ASSOCIATION_NOT_IMPLEMENTED,
      message: STAGE_MESSAGE,
    },
  })
}
