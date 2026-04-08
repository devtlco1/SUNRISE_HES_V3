import { appendConnectivityEvent } from "./append"

import type { ConnectivityEventRecord } from "@/types/connectivity-events"
import type { RuntimeResponseEnvelope } from "@/types/runtime"

function newEvent(p: Omit<ConnectivityEventRecord, "id" | "createdAt"> & { createdAt?: string }): ConnectivityEventRecord {
  const createdAt = p.createdAt ?? new Date().toISOString()
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    id,
    createdAt,
    meterId: p.meterId,
    meterSerial: p.meterSerial,
    eventType: p.eventType,
    severity: p.severity,
    message: p.message,
    remoteHost: p.remoteHost,
    remotePort: p.remotePort,
    route: p.route,
    metadata: p.metadata,
    dedupeKey: p.dedupeKey,
  }
}

function isTimeoutish(env: RuntimeResponseEnvelope<unknown>): boolean {
  const code = `${env.diagnostics?.detailCode ?? ""} ${env.error?.code ?? ""} ${env.message}`.toUpperCase()
  return code.includes("TIMEOUT") || code.includes("TIMED OUT")
}

function classifyFailureEventType(
  env: RuntimeResponseEnvelope<unknown>
): ConnectivityEventRecord["eventType"] {
  if (isTimeoutish(env)) return "timeout"
  switch (env.operation) {
    case "readIdentity":
      if (
        env.diagnostics?.associationAttempted ||
        env.associationState === "failed"
      ) {
        return "association_failed"
      }
      return "identify_failed"
    case "readBasicRegisters":
    case "readObisSelection":
      return "read_failed"
    case "relayDisconnect":
    case "relayReconnect":
    case "relayReadStatus":
      return "relay_failed"
    case "associate":
      return "association_failed"
    default:
      return "read_failed"
  }
}

/**
 * Log a single runtime outcome after a Python sidecar call returns an envelope.
 * Fire-and-forget; deduped in the append layer.
 */
export function logConnectivityRuntimeEnvelope(
  env: RuntimeResponseEnvelope<unknown>,
  ctx: {
    route: "inbound_tcp" | "direct_tcp"
    remoteHost?: string
    remotePort?: number | null
  }
): void {
  const serial = env.meterId?.trim() ?? ""
  const rh = ctx.remoteHost?.trim() ?? ""
  const rp = ctx.remotePort ?? null

  if (env.ok) {
    if (
      env.operation === "readIdentity" &&
      env.diagnostics?.verifiedOnWire &&
      env.associationState === "associated"
    ) {
      void appendConnectivityEvent(
        newEvent({
          meterId: serial,
          meterSerial: serial,
          eventType: "association_success",
          severity: "info",
          message: env.message?.trim() || "Association / read identity succeeded",
          remoteHost: rh,
          remotePort: rp,
          route: ctx.route,
          dedupeKey: `runtime:assoc_ok:${serial}`,
          metadata: {
            operation: env.operation,
            durationMs: env.durationMs,
            detailCode: env.diagnostics?.detailCode,
          },
        })
      )
    }
    return
  }

  const baseType = classifyFailureEventType(env)
  const eventType = isTimeoutish(env) ? "timeout" : baseType
  const errCode = env.error?.code ?? ""
  const detail = env.diagnostics?.detailCode ?? ""
  void appendConnectivityEvent(
    newEvent({
      meterId: serial,
      meterSerial: serial,
      eventType,
      severity: "error",
      message: [env.message, errCode, detail].filter(Boolean).join(" — ").slice(0, 500),
      remoteHost: rh,
      remotePort: rp,
      route: ctx.route,
      dedupeKey: `runtime:fail:${serial}:${env.operation}:${errCode || detail || "na"}`,
      metadata: {
        operation: env.operation,
        error: env.error ?? null,
        diagnostics: env.diagnostics ?? null,
        transportState: env.transportState,
        associationState: env.associationState,
        durationMs: env.durationMs,
      },
    })
  )
}
