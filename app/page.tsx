import { redirect } from "next/navigation"

import { getRbacSession } from "@/lib/rbac/session-server"

export const dynamic = "force-dynamic"

export default async function Home() {
  const session = await getRbacSession()
  if (session) {
    redirect("/dashboard")
  }
  redirect("/login")
}
