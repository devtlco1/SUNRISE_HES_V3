import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import { slugId } from "@/lib/meters/id-slug"
import type { MeterListRow } from "@/types/meter"

/** New registry row: serial is the operator-facing identity; customerName defaults to serial. */
export function createMeterRowFromSerial(
  serial: string,
  existingIds: Set<string>
): MeterListRow {
  const serialNumber = serial.trim()
  const t = formatOperatorDateTime(Date.now())
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
    meterProfileId: "",
    feederId: "",
    transformerId: "",
    zoneId: "",
    tariffProfileId: "",
  }
}

export function serialAlreadyRegistered(
  serial: string,
  rows: MeterListRow[]
): boolean {
  const n = serial.trim().toLowerCase()
  return rows.some((r) => r.serialNumber.trim().toLowerCase() === n)
}
