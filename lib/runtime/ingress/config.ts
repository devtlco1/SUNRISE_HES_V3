import type { MeterIngressConfig } from "@/lib/runtime/ingress/types"

function truthyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const t = v.trim().toLowerCase()
  return t === "1" || t === "true" || t === "yes"
}

/**
 * Reads inbound meter TCP ingress settings. Never contains hardcoded production endpoints.
 */
export function loadMeterIngressConfig(): MeterIngressConfig {
  const enabled = truthyEnv(process.env.RUNTIME_TCP_METER_INGRESS_ENABLED)

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
    }
  }

  return {
    enabled: true,
    host,
    port,
    socketTimeoutSeconds,
    valid: true,
    configError: null,
  }
}

/** Reserved for future internal ingest routes (Bearer check). */
export function getInternalApiToken(): string | null {
  const t = process.env.INTERNAL_API_TOKEN?.trim()
  return t && t.length > 0 ? t : null
}
