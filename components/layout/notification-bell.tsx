"use client"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatOperationalSeverity } from "@/lib/alarms/operational-format"
import { formatOperatorDateTime } from "@/lib/format/operator-datetime"
import { cn } from "@/lib/utils"
import { BellIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

type NotificationItem = {
  id: string
  title: string
  message: string
  severity: "info" | "warning" | "critical"
  sourceType: string
  alarmType: string
  status: string
  createdAt: string
  href: string
  unread: boolean
}

const POLL_MS = 20_000

export function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", {
        cache: "no-store",
        credentials: "include",
      })
      if (res.status === 403 || res.status === 401) {
        setItems([])
        setUnreadCount(0)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as {
        items: NotificationItem[]
        unreadCount: number
      }
      setItems(data.items)
      setUnreadCount(data.unreadCount)
    } catch {
      /* keep prior */
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function markAllRead() {
    setLoading(true)
    try {
      await fetch("/api/notifications/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllMatching: true }),
      })
      await load()
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div className="relative shrink-0">
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "relative"
          )}
          aria-label="Notifications"
        >
          <BellIcon className="size-4" />
        </DropdownMenuTrigger>
        {unreadCount > 0 ? (
          <Badge
            variant="destructive"
            className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        ) : null}
      </div>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-2">
          <span className="text-sm font-medium">Alarms</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-6 px-2 text-xs"
            disabled={loading || unreadCount === 0}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void markAllRead()
            }}
          >
            Mark read
          </Button>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No alarm notifications match your preferences.
            </p>
          ) : (
            items.map((item) => {
              const sev = formatOperationalSeverity(item.severity)
              return (
                <DropdownMenuItem
                  key={item.id}
                  className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                  onClick={() => {
                    setOpen(false)
                    router.push(item.href)
                  }}
                >
                  <div className="flex w-full items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        item.severity === "critical"
                          ? "bg-destructive"
                          : item.severity === "warning"
                            ? "bg-amber-500"
                            : "bg-sky-500"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {item.title}
                    </span>
                    {item.unread ? (
                      <span className="text-[10px] font-medium text-primary">
                        New
                      </span>
                    ) : null}
                  </div>
                  <div className="pl-3.5 text-[10px] text-muted-foreground">
                    <span className={sev.variant === "danger" ? "text-destructive" : ""}>
                      {sev.label}
                    </span>
                    {" · "}
                    <span className="tabular-nums">
                      {formatOperatorDateTime(item.createdAt)}
                    </span>
                  </div>
                  {item.message ? (
                    <p className="line-clamp-2 pl-3.5 text-[11px] text-muted-foreground">
                      {item.message}
                    </p>
                  ) : null}
                </DropdownMenuItem>
              )
            })
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-xs"
          onClick={() => {
            setOpen(false)
            router.push("/alarms")
          }}
        >
          Open alarms…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
