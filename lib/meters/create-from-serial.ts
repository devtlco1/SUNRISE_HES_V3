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

function slugId(serial: string, used: Set<string>): string {
  const base = serial
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
  let id = `hes-${base || "meter"}`
  let n = 0
  while (used.has(id)) {
    n += 1
    id = `hes-${base || "meter"}-${n}`
  }
  used.add(id)
  return id
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
