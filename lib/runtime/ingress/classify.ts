import type { IngressSessionClass } from "@/lib/runtime/ingress/types"

const MAX_CLASSIFY_LEN = 512

/**
 * Heuristic only: 0x7E flags suggest possible HDLC framing; not proof of valid DLMS.
 */
export function classifyInboundPreview(buffer: Buffer): IngressSessionClass {
  if (buffer.length === 0) return "tcp_connected"

  const slice = buffer.subarray(0, Math.min(buffer.length, MAX_CLASSIFY_LEN))
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0x7e) {
      return "hdlc_candidate"
    }
  }
  // Short payloads: bytes seen but too little to infer framing; longer without 0x7E: unlikely HDLC start.
  if (slice.length < 8) return "bytes_received"
  return "hdlc_unclassified"
}
