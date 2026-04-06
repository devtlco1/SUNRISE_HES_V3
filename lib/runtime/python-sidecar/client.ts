import type { IdentityPayload, RuntimeResponseEnvelope } from "@/types/runtime"

import { getPythonSidecarBaseUrl, getPythonSidecarBearerToken } from "./config"
import type { PythonReadIdentityRequest } from "./read-identity-payload"

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
