import type {
  BasicRegistersPayload,
  DiscoverySnapshotListResponse,
  DiscoverySnapshotRecord,
  DiscoverSupportedObisPayload,
  IdentityPayload,
  RuntimeResponseEnvelope,
} from "@/types/runtime"

import { getPythonSidecarBaseUrl, getPythonSidecarBearerToken } from "./config"
import type { PythonReadIdentityRequest } from "./read-identity-payload"
import type { PythonDiscoverSupportedObisRequest } from "./discover-payload"
import type { PythonReadBasicRegistersRequest } from "./read-basic-registers-payload"

export class PythonSidecarNotConfiguredError extends Error {
  constructor() {
    super(
      "RUNTIME_PYTHON_SIDECAR_URL is not set — cannot reach the Python protocol runtime"
    )
    this.name = "PythonSidecarNotConfiguredError"
  }
}

export class PythonSidecarHttpError extends Error {
  readonly status: number
  readonly bodyText: string

  constructor(status: number, bodyText: string) {
    super(`Python sidecar HTTP ${status}: ${bodyText.slice(0, 500)}`)
    this.name = "PythonSidecarHttpError"
    this.status = status
    this.bodyText = bodyText
  }
}

/**
 * Server-only: POST /v1/runtime/read-identity on the Python sidecar.
 */
export async function postReadIdentityToPythonSidecar(
  body: PythonReadIdentityRequest
): Promise<RuntimeResponseEnvelope<IdentityPayload>> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/runtime/read-identity`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as RuntimeResponseEnvelope<IdentityPayload>
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  // Trust envelope shape from our own sidecar; runtime keeps contracts aligned.
  return json as RuntimeResponseEnvelope<IdentityPayload>
}

/**
 * Server-only: POST /v1/runtime/read-basic-registers on the Python sidecar.
 */
export async function postReadBasicRegistersToPythonSidecar(
  body: PythonReadBasicRegistersRequest
): Promise<RuntimeResponseEnvelope<BasicRegistersPayload>> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/runtime/read-basic-registers`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as RuntimeResponseEnvelope<BasicRegistersPayload>
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as RuntimeResponseEnvelope<BasicRegistersPayload>
}

/**
 * Server-only: POST /v1/runtime/discover-supported-obis (association object list).
 */
export async function postDiscoverSupportedObisToPythonSidecar(
  body: PythonDiscoverSupportedObisRequest
): Promise<RuntimeResponseEnvelope<DiscoverSupportedObisPayload>> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/runtime/discover-supported-obis`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as RuntimeResponseEnvelope<DiscoverSupportedObisPayload>
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as RuntimeResponseEnvelope<DiscoverSupportedObisPayload>
}

/**
 * Server-only: GET latest persisted discovery snapshot for a meter.
 */
export async function getLatestDiscoverySnapshotFromSidecar(
  meterId: string
): Promise<DiscoverySnapshotRecord> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {}
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/runtime/discovery-snapshots/${encodeURIComponent(meterId)}/latest`
  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as DiscoverySnapshotRecord
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as DiscoverySnapshotRecord
}

/**
 * Server-only: list stored discovery snapshots (history + latest fallback).
 */
export async function listDiscoverySnapshotsFromSidecar(
  meterId: string
): Promise<DiscoverySnapshotListResponse> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {}
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/runtime/discovery-snapshots/${encodeURIComponent(meterId)}`
  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as DiscoverySnapshotListResponse
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as DiscoverySnapshotListResponse
}

/** v1 local sidecar queue — enqueue response (202). */
export interface PythonReadJobEnqueueResponse {
  jobId: string
  kind: "readIdentity" | "readBasicRegisters"
  status: "queued"
  meterId: string
  createdAt: string
  note?: string
}

export type PythonReadJobLifecycleStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"

/** Full job record from GET /v1/jobs/{jobId}. */
export interface PythonReadJobGetResponse {
  jobId: string
  kind: "readIdentity" | "readBasicRegisters"
  status: PythonReadJobLifecycleStatus
  meterId: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  /** RuntimeResponseEnvelope JSON when worker finished without crashing. */
  result?: Record<string, unknown>
  /** Worker crash only; meter failures use result.ok === false. */
  error?: string
  note?: string
}

/**
 * Server-only: enqueue read-identity job (async execution on sidecar).
 */
export async function postReadIdentityJobToPythonSidecar(
  body: PythonReadIdentityRequest
): Promise<PythonReadJobEnqueueResponse> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/jobs/read-identity`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as PythonReadJobEnqueueResponse
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as PythonReadJobEnqueueResponse
}

/**
 * Server-only: enqueue read-basic-registers job.
 */
export async function postReadBasicRegistersJobToPythonSidecar(
  body: PythonReadBasicRegistersRequest
): Promise<PythonReadJobEnqueueResponse> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/jobs/read-basic-registers`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as PythonReadJobEnqueueResponse
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as PythonReadJobEnqueueResponse
}

/**
 * Server-only: poll job status / result.
 */
export async function getPythonReadJobFromSidecar(
  jobId: string
): Promise<PythonReadJobGetResponse> {
  const base = getPythonSidecarBaseUrl()
  if (!base) {
    throw new PythonSidecarNotConfiguredError()
  }

  const headers: Record<string, string> = {}
  const token = getPythonSidecarBearerToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const url = `${base}/v1/jobs/${encodeURIComponent(jobId)}`
  const res = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PythonSidecarHttpError(res.status, text)
  }

  let json: unknown
  try {
    json = JSON.parse(text) as PythonReadJobGetResponse
  } catch {
    throw new Error("Python sidecar returned non-JSON body")
  }

  return json as PythonReadJobGetResponse
}
