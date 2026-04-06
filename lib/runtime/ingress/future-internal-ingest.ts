/**
 * Placeholder boundary: protocol execution vs reading persistence.
 * When inbound DLMS yields readings, they should cross this layer—not the web UI.
 */
export type InboundMeterIdentityPlaceholder = {
  remoteAddress: string
  remotePort: number
}

export function placeholderForFutureReadingIngest(
  identity: InboundMeterIdentityPlaceholder,
  readingBatch: unknown
): void {
  void identity
  void readingBatch
  // No persistence wiring in the ingress foundation step.
}
