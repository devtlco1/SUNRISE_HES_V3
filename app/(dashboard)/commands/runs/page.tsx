import { commandsLegacyPathToTab } from "@/lib/commands/nav"
import { redirect } from "next/navigation"

export default function CommandsRunsRedirectPage() {
  const tab = commandsLegacyPathToTab("/commands/runs")
  redirect(`/commands?tab=${tab}`)
}
