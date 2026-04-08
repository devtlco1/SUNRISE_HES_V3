import type { ConnectivityPhase1LiveStatus } from "@/types/connectivity"

/** Matches `StatusBadge` variant names (keep lib free of UI component imports). */
export type Phase1StatusBadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info"

export function phase1LiveStatusPresentation(s: ConnectivityPhase1LiveStatus): {
  label: string
  variant: Phase1StatusBadgeVariant
} {
  switch (s) {
    case "live_inbound":
      return { label: "Live (inbound)", variant: "success" }
    case "online_recent_registry":
      return { label: "Online (recent)", variant: "success" }
    case "offline":
      return { label: "Offline", variant: "danger" }
    case "never_seen_registry":
      return { label: "Never seen", variant: "neutral" }
    case "unknown_live":
      return { label: "Unknown", variant: "warning" }
    default:
      return { label: s, variant: "neutral" }
  }
}
