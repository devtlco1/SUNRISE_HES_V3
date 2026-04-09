import { redirect } from "next/navigation"

import { getRbacSession } from "@/lib/rbac/session-server"

/** Use in server layouts/pages: send anonymous users to login. */
export async function requireAuthenticatedSession() {
  const session = await getRbacSession()
  if (!session) {
    redirect("/login")
  }
  return session
}
