import type { Metadata } from "next"

import { ScannerWorkspaceClient } from "@/components/scanner/scanner-workspace-client"

export const metadata: Metadata = {
  title: "Scanner",
  description: "Inbound modem staging and meter onboarding by serial.",
}

export default function ScannerPage() {
  return <ScannerWorkspaceClient />
}
