import type { Metadata } from "next"

import { ReadingsWorkspaceClient } from "@/components/readings/readings-workspace-client"

export const metadata: Metadata = {
  title: "Readings",
  description:
    "Operator workspace: inbound modem listener, staged socket, identity and basic-register reads.",
}

export default function ReadingsPage() {
  return <ReadingsWorkspaceClient />
}
