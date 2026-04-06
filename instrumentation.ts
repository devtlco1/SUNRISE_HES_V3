/**
 * Next.js instrumentation hook: runs once per Node server process.
 * Starts inbound meter TCP listener when enabled via env (non-blocking for HTTP).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return
  const { bootstrapMeterIngressOnce } = await import(
    "@/lib/runtime/ingress/listener"
  )
  bootstrapMeterIngressOnce()
}
