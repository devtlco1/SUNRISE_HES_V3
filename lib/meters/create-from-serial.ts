import { slugId } from "@/lib/meters/id-slug"
import type { MeterListRow } from "@/types/meter"

function stampLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${mo}-${da} ${h}:${mi}`
}

/** New registry row: serial is the operator-facing identity; customerName defaults to serial. */
export function createMeterRowFromSerial(
  serial: string,
  existingIds: Set<string>
): MeterListRow {
  const serialNumber = serial.trim()
  const t = stampLocal()
  return {
    id: slugId(serialNumber, existingIds),
    serialNumber,
    customerName: serialNumber,
    feeder: "—",
    transformer: "—",
    zone: "—",
    manufacturer: "—",
    model: "—",
    commStatus: "offline",
    relayStatus: "unknown",
    lastReadingAt: t,
    lastCommunicationAt: t,
    alarmState: "none",
    phaseType: "single",
    firmwareVersion: "—",
  }
}

export function serialAlreadyRegistered(
  serial: string,
  rows: MeterListRow[]
): boolean {
  const n = serial.trim().toLowerCase()
  return rows.some((r) => r.serialNumber.trim().toLowerCase() === n)
}
