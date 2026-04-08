import { commandsLegacyPathToTab } from "@/lib/commands/nav"
import { redirect } from "next/navigation"

export default function CommandsRunNowRedirectPage() {
  const tab = commandsLegacyPathToTab("/commands/run-now")
  redirect(`/commands?tab=${tab}`)
}
