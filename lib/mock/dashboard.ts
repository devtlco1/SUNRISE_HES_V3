import type { ActivityItem, DashboardStat, LatestCommandRow } from "@/types/dashboard"

export const mockDashboardStats: DashboardStat[] = [
  {
    label: "Total Meters",
    value: "1,248",
    description: "Registered in this environment",
  },
  {
    label: "Online Meters",
    value: "1,102",
    description: "Reporting within the last 15 minutes",
  },
  {
    label: "Pending Commands",
    value: "14",
    description: "Awaiting acknowledgement",
  },
  {
    label: "Active Alarms",
    value: "3",
    description: "Open operational alarms",
  },
]

export const mockRecentActivity: ActivityItem[] = [
  {
    id: "act-1",
    occurredAt: "2026-04-06 08:42",
    summary: "Bulk read completed for substation North-12 (186 meters).",
    tone: "success",
  },
  {
    id: "act-2",
    occurredAt: "2026-04-06 08:18",
    summary: "Gateway GW-04 missed two scheduled polls.",
    tone: "warning",
  },
  {
    id: "act-3",
    occurredAt: "2026-04-06 07:55",
    summary: "Operator acknowledged alarm ALM-8831 (low voltage).",
    tone: "neutral",
  },
  {
    id: "act-4",
    occurredAt: "2026-04-06 07:12",
    summary: "Firmware push window closed; 42 meters deferred to next slot.",
    tone: "neutral",
  },
]

export const mockLatestCommands: LatestCommandRow[] = [
  {
    id: "cmd-901",
    command: "On-demand read — instant registers",
    meterSerial: "SN-448821",
    status: "success",
    submittedAt: "2026-04-06 08:40",
  },
  {
    id: "cmd-902",
    command: "Relay test — verify disconnect",
    meterSerial: "SN-102933",
    status: "pending",
    submittedAt: "2026-04-06 08:36",
  },
  {
    id: "cmd-903",
    command: "Clock sync",
    meterSerial: "SN-771204",
    status: "failed",
    submittedAt: "2026-04-06 08:31",
  },
  {
    id: "cmd-904",
    command: "Profile read — last 24h",
    meterSerial: "SN-220198",
    status: "neutral",
    submittedAt: "2026-04-06 08:22",
  },
]
