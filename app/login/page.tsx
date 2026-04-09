import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { getRbacSession } from "@/lib/rbac/session-server"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const session = await getRbacSession()
  if (session) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <LoginForm />
    </div>
  )
}
