/**
 * Browser → Next `/api/readings/*` (server calls Python sidecar; no direct browser→Python).
 */

import type {
  BasicRegistersPayload,
  IdentityPayload,
  ObisSelectionJobPollView,
  ReadObisSelectionPayload,
  ReadObisSelectionRequest,
  RelayControlPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export const READINGS_FETCH_NETWORK_ERROR =
  "Network error while contacting the readings API."

export type TcpListenerStatus = Record<string, unknown>

export type ReadingsApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

export type ReadingsTransportMode = "inbound" | "direct"

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function isObisSelectionJobPollView(v: unknown): v is ObisSelectionJobPollView {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  const st = o.status
  const okStatus =
    st === "queued" ||
    st === "running" ||
    st === "waiting_for_restage" ||
    st === "completed" ||
    st === "failed" ||
    st === "cancelled"
  return typeof o.jobId === "string" && typeof o.status === "string" && okStatus && Array.isArray(o.rows)
}

function formatReadingsProxyFailure(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>
    const msg = typeof p.message === "string" ? p.message : ""
    const errTag = typeof p.error === "string" ? p.error : ""
    if (typeof p.hint === "string" && p.hint.trim()) {
      return [errTag || `HTTP ${status}`, p.hint].filter(Boolean).join(": ")
    }
    if (typeof p.downstreamUrl === "string" && p.downstreamUrl.trim()) {
      return [errTag || `HTTP ${status}`, p.downstreamUrl, msg].filter(Boolean).join(" — ")
    }
    const py = p.pythonDetail
    if (Array.isArray(py)) {
      const bits = py
        .map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: unknown }).msg) : JSON.stringify(x)))
        .filter(Boolean)
      if (bits.length) return [msg, bits.join("; ")].filter(Boolean).join(" — ") || `HTTP ${status}`
    }
    if (py && typeof py === "object" && "detail" in py) {
      const d = (py as { detail: unknown }).detail
      if (typeof d === "string") return [msg, d].filter(Boolean).join(" — ") || d
    }
    if (typeof p.bodyPreview === "string" && p.bodyPreview.trim()) {
      return [msg, p.bodyPreview.slice(0, 500)].filter(Boolean).join(" — ")
    }
    if (typeof p.body === "string" && p.body.trim()) {
      return [errTag || `HTTP ${status}`, p.body.slice(0, 500)].filter(Boolean).join(" — ")
    }
    if (typeof p.error === "string") return [p.error, msg].filter(Boolean).join(": ") || p.error
  }
  return `HTTP ${status}`
}

function tcpListenerSessionBusyMessage(parsed: unknown): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
    if (typeof o.detail === "string" && o.detail.trim()) return o.detail.trim()
  }
  return "Inbound modem busy — finish the current action first."
}

export async function fetchTcpListenerStatus(
  signal?: AbortSignal
): Promise<ReadingsApiResult<TcpListenerStatus>> {
  try {
    const res = await fetch("/api/readings/tcp-listener/status", {
      method: "GET",
      cache: "no-store",
      signal,
    })
    const body = await parseJson(res)
    if (!res.ok) {
      const err =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${res.status}`
      const msg =
        body &&
        typeof body === "object" &&
        "message" in body &&
        typeof (body as { message: unknown }).message === "string"
          ? `${err}: ${(body as { message: string }).message}`
          : err
      return { ok: false, error: msg, status: res.status }
    }
    return { ok: true, data: (body ?? {}) as TcpListenerStatus }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postTcpListenerReadIdentity(
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<IdentityPayload>>> {
  try {
    const res = await fetch("/api/readings/tcp-listener/read-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId }),
      cache: "no-store",
      signal,
    })
    const body = await parseJson(res)
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: tcpListenerSessionBusyMessage(body), status: 409 }
      }
      const err =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${res.status}`
      return { ok: false, error: err, status: res.status }
    }
    return {
      ok: true,
      data: body as RuntimeResponseEnvelope<IdentityPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postDirectReadIdentity(
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<IdentityPayload>>> {
  try {
    const res = await fetch("/api/readings/runtime/read-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId }),
      cache: "no-store",
      signal,
    })
    const body = await parseJson(res)
    if (!res.ok) {
      const err =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${res.status}`
      return { ok: false, error: err, status: res.status }
    }
    return {
      ok: true,
      data: body as RuntimeResponseEnvelope<IdentityPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postReadObisSelectionDirect(
  body: ReadObisSelectionRequest,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<ReadObisSelectionPayload>>> {
  try {
    const res = await fetch("/api/readings/runtime/read-obis-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    })
    const parsed = await parseJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    return {
      ok: true,
      data: parsed as RuntimeResponseEnvelope<ReadObisSelectionPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postStartTcpListenerObisSelectionJob(
  body: ReadObisSelectionRequest,
  signal?: AbortSignal
): Promise<ReadingsApiResult<{ jobId: string }>> {
  try {
    const res = await fetch("/api/readings/tcp-listener/read-obis-selection/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    })
    const parsed = await parseJson(res)
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: tcpListenerSessionBusyMessage(parsed), status: 409 }
      }
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as { jobId: unknown }).jobId !== "string"
    ) {
      return { ok: false, error: "Invalid job start response from readings API." }
    }
    return { ok: true, data: { jobId: (parsed as { jobId: string }).jobId } }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postTcpListenerObisJobCancel(
  jobId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<{ ok: boolean }>> {
  try {
    const res = await fetch(
      `/api/readings/tcp-listener/read-obis-selection/job/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST", cache: "no-store", signal }
    )
    const parsed = await parseJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    if (!parsed || typeof parsed !== "object" || (parsed as { ok: unknown }).ok !== true) {
      return { ok: false, error: "Cancel rejected or invalid response." }
    }
    return { ok: true, data: { ok: true } }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postTcpListenerObisJobSkipRow(
  jobId: string,
  index: number,
  signal?: AbortSignal
): Promise<ReadingsApiResult<{ ok: boolean }>> {
  try {
    const res = await fetch(
      `/api/readings/tcp-listener/read-obis-selection/job/${encodeURIComponent(jobId)}/skip`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
        cache: "no-store",
        signal,
      }
    )
    const parsed = await parseJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    if (!parsed || typeof parsed !== "object" || (parsed as { ok: unknown }).ok !== true) {
      return { ok: false, error: "Skip rejected or invalid response." }
    }
    return { ok: true, data: { ok: true } }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function getTcpListenerObisSelectionJobPoll(
  jobId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<ObisSelectionJobPollView>> {
  try {
    const res = await fetch(
      `/api/readings/tcp-listener/read-obis-selection/job/${encodeURIComponent(jobId)}`,
      { method: "GET", cache: "no-store", signal }
    )
    const parsed = await parseJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    if (!isObisSelectionJobPollView(parsed)) {
      return { ok: false, error: "Invalid job poll response from readings API." }
    }
    return { ok: true, data: parsed }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postReadObisSelectionTcpListener(
  body: ReadObisSelectionRequest,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<ReadObisSelectionPayload>>> {
  try {
    const res = await fetch("/api/readings/tcp-listener/read-obis-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    })
    const parsed = await parseJson(res)
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: tcpListenerSessionBusyMessage(parsed), status: 409 }
      }
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    return {
      ok: true,
      data: parsed as RuntimeResponseEnvelope<ReadObisSelectionPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postDirectReadBasicRegisters(
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<BasicRegistersPayload>>> {
  try {
    const res = await fetch("/api/readings/runtime/read-basic-registers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId }),
      cache: "no-store",
      signal,
    })
    const body = await parseJson(res)
    if (!res.ok) {
      const err =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${res.status}`
      return { ok: false, error: err, status: res.status }
    }
    return {
      ok: true,
      data: body as RuntimeResponseEnvelope<BasicRegistersPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postTcpListenerReadBasicRegisters(
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<BasicRegistersPayload>>> {
  try {
    const res = await fetch("/api/readings/tcp-listener/read-basic-registers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId }),
      cache: "no-store",
      signal,
    })
    const body = await parseJson(res)
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: tcpListenerSessionBusyMessage(body), status: 409 }
      }
      const err =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `HTTP ${res.status}`
      return { ok: false, error: err, status: res.status }
    }
    return {
      ok: true,
      data: body as RuntimeResponseEnvelope<BasicRegistersPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

async function postRelayReadings(
  transport: ReadingsTransportMode,
  subpath: "relay-read-status" | "relay-disconnect" | "relay-reconnect",
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<RelayControlPayload>>> {
  const base =
    transport === "inbound"
      ? "/api/readings/tcp-listener"
      : "/api/readings/runtime"
  try {
    const res = await fetch(`${base}/${subpath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meterId }),
      cache: "no-store",
      signal,
    })
    const parsed = await parseJson(res)
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: tcpListenerSessionBusyMessage(parsed), status: 409 }
      }
      return {
        ok: false,
        error: formatReadingsProxyFailure(parsed, res.status),
        status: res.status,
      }
    }
    return {
      ok: true,
      data: parsed as RuntimeResponseEnvelope<RelayControlPayload>,
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e
    return { ok: false, error: READINGS_FETCH_NETWORK_ERROR }
  }
}

export async function postRelayReadStatusReadings(
  transport: ReadingsTransportMode,
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<RelayControlPayload>>> {
  return postRelayReadings(transport, "relay-read-status", meterId, signal)
}

export async function postRelayDisconnectReadings(
  transport: ReadingsTransportMode,
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<RelayControlPayload>>> {
  return postRelayReadings(transport, "relay-disconnect", meterId, signal)
}

export async function postRelayReconnectReadings(
  transport: ReadingsTransportMode,
  meterId: string,
  signal?: AbortSignal
): Promise<ReadingsApiResult<RuntimeResponseEnvelope<RelayControlPayload>>> {
  return postRelayReadings(transport, "relay-reconnect", meterId, signal)
}
