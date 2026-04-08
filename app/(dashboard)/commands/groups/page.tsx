import { commandsLegacyPathToTab } from "@/lib/commands/nav"
import { redirect } from "next/navigation"

export default function CommandsGroupsRedirectPage() {
  const tab = commandsLegacyPathToTab("/commands/groups")
  redirect(`/commands?tab=${tab}`)
}
