import { appendConnectivityEvent } from "./append"

import type { ConnectivityEventRecord } from "@/types/connectivity-events"
import type { PythonSidecarHttpError } from "@/lib/runtime/python-sidecar/client"

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

type OpKind = "readIdentity" | "readBasicRegisters" | "readObisSelection" | "relay"

function classifyProxyFailure(
  kind: OpKind,
  status: number,
  message: string
): ConnectivityEventRecord["eventType"] {
  const m = message.toUpperCase()
  if (status === 504 || m.includes("TIMEOUT") || m.includes("TIMED OUT")) {
    return "timeout"
  }
  if (kind === "relay") return "relay_failed"
  return "read_failed"
}

/** Log when the sidecar returns non-2xx before a runtime envelope is produced. */
export function logConnectivityPythonProxyFailure(
  meterId: string,
  kind: OpKind,
  e: PythonSidecarHttpError,
  route: "inbound_tcp" | "direct_tcp"
): void {
  const serial = meterId.trim()
  const eventType = classifyProxyFailure(kind, e.status, e.message)
  void appendConnectivityEvent(
    newEvent({
      meterId: serial,
      meterSerial: serial,
      eventType,
      severity: "error",
      message: `Python sidecar HTTP ${e.status}: ${e.message.slice(0, 400)}`,
      remoteHost: "",
      remotePort: null,
      route,
      dedupeKey: `proxy:${route}:${serial}:${kind}:${e.status}`,
      metadata: {
        httpStatus: e.status,
        requestUrl: e.requestUrl ?? null,
        kind,
      },
    })
  )
}
