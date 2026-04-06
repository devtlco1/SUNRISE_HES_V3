import type { IngressTcpSessionMode, MeterIngressConfig } from "@/lib/runtime/ingress/types"

function truthyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const t = v.trim().toLowerCase()
  return t === "1" || t === "true" || t === "yes"
}

const SESSION_MODE_ENV = "RUNTIME_TCP_METER_INGRESS_SESSION_MODE" as const

/**
 * DLMS session timing on accepted TCP sockets. Invalid values fall back to auto with a config error.
 */
export function loadMeterIngressSessionMode(): {
  mode: IngressTcpSessionMode
  configError: string | null
} {
  const raw = process.env[SESSION_MODE_ENV]?.trim().toLowerCase()
  if (raw === undefined || raw === "" || raw === "auto" || raw === "auto_associate_on_accept") {
    return { mode: "auto_associate_on_accept", configError: null }
  }
  if (raw === "staged" || raw === "staged_triggered_session") {
    return { mode: "staged_triggered_session", configError: null }
  }
  const shown = process.env[SESSION_MODE_ENV]?.trim() ?? ""
  return {
    mode: "auto_associate_on_accept",
    configError: `Invalid ${SESSION_MODE_ENV}="${shown}". Use auto_associate_on_accept or staged_triggered_session.`,
  }
}

/**
 * Reads inbound meter TCP ingress settings. Never contains hardcoded production endpoints.
 */
export function loadMeterIngressConfig(): MeterIngressConfig {
  const enabled = truthyEnv(process.env.RUNTIME_TCP_METER_INGRESS_ENABLED)
  const { mode: sessionMode, configError: sessionModeConfigError } = loadMeterIngressSessionMode()

  const hostRaw = process.env.RUNTIME_TCP_METER_INGRESS_HOST?.trim()
  const host = hostRaw === undefined || hostRaw === "" ? "0.0.0.0" : hostRaw

  const portRaw = process.env.RUNTIME_TCP_METER_INGRESS_PORT?.trim()
  const port = portRaw === undefined || portRaw === "" ? NaN : Number.parseInt(portRaw, 10)

  const timeoutRaw =
    process.env.RUNTIME_TCP_METER_INGRESS_SOCKET_TIMEOUT_SECONDS?.trim()
  const socketTimeoutSeconds =
    timeoutRaw === undefined || timeoutRaw === ""
      ? 120
      : Number.parseInt(timeoutRaw, 10)

  if (!enabled) {
    return {
      enabled: false,
      host,
      port: Number.isFinite(port) ? port : 0,
      socketTimeoutSeconds: Number.isFinite(socketTimeoutSeconds)
        ? socketTimeoutSeconds
        : 120,
      valid: true,
      configError: null,
      sessionMode,
      sessionModeConfigError,
    }
  }

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return {
      enabled: true,
      host,
      port: 0,
      socketTimeoutSeconds: Number.isFinite(socketTimeoutSeconds)
        ? socketTimeoutSeconds
        : 120,
      valid: false,
      configError:
        "RUNTIME_TCP_METER_INGRESS_PORT must be set to an integer 1–65535 when ingress is enabled.",
      sessionMode,
      sessionModeConfigError,
    }
  }

  if (!Number.isFinite(socketTimeoutSeconds) || socketTimeoutSeconds < 1) {
    return {
      enabled: true,
      host,
      port,
      socketTimeoutSeconds: 120,
      valid: false,
      configError:
        "RUNTIME_TCP_METER_INGRESS_SOCKET_TIMEOUT_SECONDS must be a positive integer when set.",
      sessionMode,
      sessionModeConfigError,
    }
  }

  return {
    enabled: true,
    host,
    port,
    socketTimeoutSeconds,
    valid: true,
    configError: null,
    sessionMode,
    sessionModeConfigError,
  }
}

/** Reserved for future internal ingest routes (Bearer check). */
export function getInternalApiToken(): string | null {
  const t = process.env.INTERNAL_API_TOKEN?.trim()
  return t && t.length > 0 ? t : null
}
