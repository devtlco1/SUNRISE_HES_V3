import commandsSeed from "@/data/commands.json"
import { normalizeCommandJobRows } from "@/lib/commands/normalize"
import type { CommandJobRow, CommandTemplateOption } from "@/types/command"

export const commandTemplateOptions: CommandTemplateOption[] = [
  {
    id: "disconnect_relay",
    label: "Disconnect relay",
    commandType: "Relay control",
  },
  {
    id: "reconnect_relay",
    label: "Reconnect relay",
    commandType: "Relay control",
  },
  {
    id: "on_demand_read",
    label: "On-demand read",
    commandType: "Read",
  },
  {
    id: "read_profile",
    label: "Read profile",
    commandType: "Read",
  },
  { id: "sync_time", label: "Sync time", commandType: "Configuration" },
  {
    id: "ping_comm",
    label: "Ping / communication check",
    commandType: "Diagnostics",
  },
]

/**
 * Normalized jobs from `data/commands.json`.
 * Set `NEXT_PUBLIC_COMMANDS_USE_MOCK=true` on the Commands page to skip HTTP.
 */
export const mockCommandJobs: CommandJobRow[] =
  normalizeCommandJobRows(commandsSeed)
