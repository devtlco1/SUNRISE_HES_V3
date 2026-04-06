/**
 * Compare computed HDLC FCS-16 to the two on-wire octets.
 * Some meters transmit the 16-bit FCS big-endian (high byte first); our outbound builder
 * uses little-endian. Both interpretations are deterministic — accept either when equal.
 */
export function fcs16MatchesWire(
  calc: number,
  lowByteFirstOnWire: number,
  highByteSecondOnWire: number
): "le" | "be" | null {
  const le = lowByteFirstOnWire | (highByteSecondOnWire << 8)
  const be = (lowByteFirstOnWire << 8) | highByteSecondOnWire
  if (calc === le) return "le"
  if (calc === be) return "be"
  return null
}
