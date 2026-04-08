"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo } from "react"

import { useCan } from "@/components/rbac/operator-session-context"
import {
  parseCommandsTabParam,
  type CommandsWorkspaceTab,
} from "@/lib/commands/nav"
import { cn } from "@/lib/utils"

import { CommandGroupsPageClient } from "@/components/commands/command-groups-page-client"
import { CommandSchedulesTabClient } from "@/components/commands/command-schedules-tab-client"
import { ObisCodeGroupsTabClient } from "@/components/commands/obis-code-groups-tab-client"
import { RunCommandTabClient } from "@/components/commands/run-command-tab-client"

const TABS: {
  id: CommandsWorkspaceTab
  label: string
  permission: string
}[] = [
  { id: "meter-groups", label: "Meter Groups", permission: "commands.tab.meter_groups" },
  { id: "obis-groups", label: "OBIS / Actions", permission: "commands.tab.obis_actions" },
  { id: "schedules", label: "Schedules", permission: "commands.tab.schedules" },
  { id: "run", label: "Run", permission: "commands.tab.run" },
]

export function CommandsWorkspaceClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const canView = useCan("commands.view")
  const canMeter = useCan("commands.tab.meter_groups")
  const canObis = useCan("commands.tab.obis_actions")
  const canSched = useCan("commands.tab.schedules")
  const canRun = useCan("commands.tab.run")
  const permMap = useMemo(
    () => ({
      "meter-groups": canMeter,
      "obis-groups": canObis,
      schedules: canSched,
      run: canRun,
    }),
    [canMeter, canObis, canSched, canRun]
  )

  const visibleTabs = useMemo(
    () => TABS.filter((t) => permMap[t.id]),
    [permMap]
  )

  const tab = useMemo(() => {
    const raw = parseCommandsTabParam(searchParams.get("tab"))
    if (permMap[raw]) return raw
    return visibleTabs[0]?.id ?? "meter-groups"
  }, [searchParams, permMap, visibleTabs])

  useEffect(() => {
    if (!canView) return
    const q = searchParams.get("tab")
    const parsed = parseCommandsTabParam(q)
    if (q == null || !permMap[parsed]) {
      const first = visibleTabs[0]?.id
      if (first) {
        router.replace(`/commands?tab=${first}`, { scroll: false })
      }
    }
  }, [router, searchParams, canView, permMap, visibleTabs])

  const setTab = useCallback(
    (id: CommandsWorkspaceTab) => {
      router.replace(`/commands?tab=${id}`, { scroll: false })
    },
    [router]
  )

  if (!canView) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        You do not have permission to open the Commands workspace.
      </p>
    )
  }

  if (visibleTabs.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        No commands tabs are enabled for your role.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-1 border-b border-border pb-2"
        role="tablist"
        aria-label="Commands workspace"
      >
        {visibleTabs.map((t) => (
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
