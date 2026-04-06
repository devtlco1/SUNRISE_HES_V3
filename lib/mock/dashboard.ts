import type {
  ActivityItem,
  DashboardStat,
  RecentCommandDigestRow,
} from "@/types/dashboard"

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

export const mockLatestCommands: RecentCommandDigestRow[] = [
  {
    id: "cmd-901",
    templateName: "On-demand read — instant registers",
    queueState: "completed",
    submittedAt: "2026-04-06 08:40",
    resultSummary: "SN-448821 — success",
  },
  {
    id: "cmd-902",
    templateName: "Relay test — verify disconnect",
    queueState: "queued",
    submittedAt: "2026-04-06 08:36",
    resultSummary: "SN-102933 — pending head-end",
  },
  {
    id: "cmd-903",
    templateName: "Clock sync",
    queueState: "failed",
    submittedAt: "2026-04-06 08:31",
    resultSummary: "SN-771204 — timeout",
  },
  {
    id: "cmd-904",
    templateName: "Profile read — last 24h",
    queueState: "submitted",
    submittedAt: "2026-04-06 08:22",
    resultSummary: "SN-220198 — awaiting dispatch",
  },
]
