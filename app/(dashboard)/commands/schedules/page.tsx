import { commandsLegacyPathToTab } from "@/lib/commands/nav"
import { redirect } from "next/navigation"

export default function CommandsSchedulesRedirectPage() {
  const tab = commandsLegacyPathToTab("/commands/schedules")
  redirect(`/commands?tab=${tab}`)
}
