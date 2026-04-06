/**
 * Server-only configuration for the Python protocol runtime sidecar.
 * Never expose these values to the browser.
 */

export function getPythonSidecarBaseUrl(): string | null {
  const raw = process.env.RUNTIME_PYTHON_SIDECAR_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, "")
}

export function getPythonSidecarBearerToken(): string | null {
  const t = process.env.RUNTIME_PYTHON_SIDECAR_TOKEN?.trim()
  return t && t.length > 0 ? t : null
}
