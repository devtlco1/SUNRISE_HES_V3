import type { MeterConnectivityRow } from "@/types/table"

export const mockMeterConnectivityRows: MeterConnectivityRow[] = [
  {
    id: "m-1",
    name: "SN-448821",
    channel: "Cell / LTE",
    lastSeen: "2026-04-06 08:41",
    linkStatus: "online",
  },
  {
    id: "m-2",
    name: "SN-102933",
    channel: "Cell / LTE",
    lastSeen: "2026-04-06 08:39",
    linkStatus: "online",
  },
  {
    id: "m-3",
    name: "SN-771204",
    channel: "RF mesh / repeater",
    lastSeen: "2026-04-06 07:58",
    linkStatus: "degraded",
  },
  {
    id: "m-4",
    name: "SN-220198",
    channel: "Fixed line",
    lastSeen: "2026-04-05 22:10",
    linkStatus: "offline",
  },
  {
    id: "m-5",
    name: "SN-883102",
    channel: "Cell / LTE",
    lastSeen: "2026-04-06 08:40",
    linkStatus: "online",
  },
]
