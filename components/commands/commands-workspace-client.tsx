"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo } from "react"

import {
  parseCommandsTabParam,
  type CommandsWorkspaceTab,
} from "@/lib/commands/nav"
import { cn } from "@/lib/utils"

import { CommandGroupsPageClient } from "@/components/commands/command-groups-page-client"
import { CommandSchedulesTabClient } from "@/components/commands/command-schedules-tab-client"
import { ObisCodeGroupsTabClient } from "@/components/commands/obis-code-groups-tab-client"
import { RunCommandTabClient } from "@/components/commands/run-command-tab-client"

const TABS: { id: CommandsWorkspaceTab; label: string }[] = [
  { id: "meter-groups", label: "Meter Groups" },
  { id: "obis-groups", label: "OBIS / Actions" },
  { id: "schedules", label: "Schedules" },
  { id: "run", label: "Run" },
]

export function CommandsWorkspaceClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = useMemo(
    () => parseCommandsTabParam(searchParams.get("tab")),
    [searchParams]
  )

  useEffect(() => {
    if (searchParams.get("tab") == null) {
      router.replace("/commands?tab=meter-groups", { scroll: false })
    }
  }, [router, searchParams])

  const setTab = useCallback(
    (id: CommandsWorkspaceTab) => {
      router.replace(`/commands?tab=${id}`, { scroll: false })
    },
    [router]
  )

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-1 border-b border-border pb-2"
        role="tablist"
        aria-label="Commands workspace"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="min-h-[320px]">
        {tab === "meter-groups" ? <CommandGroupsPageClient /> : null}
        {tab === "obis-groups" ? <ObisCodeGroupsTabClient /> : null}
        {tab === "schedules" ? <CommandSchedulesTabClient /> : null}
        {tab === "run" ? <RunCommandTabClient /> : null}
      </div>
    </div>
  )
}
