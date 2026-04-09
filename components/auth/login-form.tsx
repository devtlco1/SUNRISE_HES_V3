"use client"

import { SunriseLogo } from "@/components/branding/sunrise-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function LoginForm() {
  const router = useRouter()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const l = login.trim()
    if (!l || !password) {
      setError("Enter username or email and password.")
      return
    }
    setPending(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: l, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Invalid username or password."
            : data.error === "MISSING_FIELDS"
              ? "Enter username or email and password."
              : "Sign-in failed. Try again."
        )
        return
      }
      router.replace("/dashboard")
      router.refresh()
    } catch {
      setError("Network error. Check connection and retry.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <SunriseLogo className="justify-center" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            SUNRISE HES
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Operator sign-in
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <label className="block space-y-1.5 text-left">
          <span className="text-xs font-medium text-muted-foreground">
            Username or email
          </span>
          <Input
            name="login"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            disabled={pending}
            className="h-9"
          />
        </label>
        <label className="block space-y-1.5 text-left">
          <span className="text-xs font-medium text-muted-foreground">
            Password
          </span>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            className="h-9"
          />
        </label>
        <Button type="submit" className="h-9 w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  )
}
