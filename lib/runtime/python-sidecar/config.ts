/**
 * Server-only configuration for the Python protocol runtime sidecar.
 * Never expose these values to the browser.
 */

export function getPythonSidecarBaseUrl(): string | null {
  const raw = process.env.RUNTIME_PYTHON_SIDECAR_URL?.trim()
  if (!raw) return null
  let base = raw.replace(/\/$/, "")
  // If the env value mistakenly includes the runtime API prefix, client paths
  // become doubled (…/v1/runtime/v1/runtime/…) and FastAPI returns 404.
  if (base.endsWith("/v1/runtime")) {
    base = base.slice(0, -"/v1/runtime".length)
  } else if (base.endsWith("/v1")) {
    base = base.slice(0, -"/v1".length)
  }
  base = base.replace(/\/$/, "")
  return base.length > 0 ? base : null
}

export function getPythonSidecarBearerToken(): string | null {
  const t = process.env.RUNTIME_PYTHON_SIDECAR_TOKEN?.trim()
  return t && t.length > 0 ? t : null
}
