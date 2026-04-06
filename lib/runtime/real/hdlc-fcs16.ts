/**
 * HDLC FCS-16 (CRC-16-CCITT reflected / "false") for IEC 62056-46 style frames.
 * Matches the sample vectors cross-checked against a Python reference build.
 */

export function countFcs16(buffer: Uint8Array, offset: number, count: number): number {
  let crc = 0xffff
  const end = offset + count
  for (let i = offset; i < end; i++) {
    crc ^= buffer[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >> 1) ^ 0x8408
      else crc >>= 1
    }
  }
  crc ^= 0xffff
  return ((crc >> 8) & 0xff) | ((crc << 8) & 0xff00)
}
