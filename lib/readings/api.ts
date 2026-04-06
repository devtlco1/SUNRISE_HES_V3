/**
 * Browser → Next `/api/readings/*` (server calls Python sidecar; no direct browser→Python).
 */

import type {
  BasicRegistersPayload,
  IdentityPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

export const READINGS_FETCH_NETWORK_ERROR =
  "Network error while contacting the readings API."

export type TcpListenerStatus = Record<string, unknown>

export type ReadingsApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
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
