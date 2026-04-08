"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
import { buttonVariants } from "@/components/ui/button"
import type { CommandsOverviewStats } from "@/types/command-operator"

type OverviewResponse = {
  stats: CommandsOverviewStats
  legacyCatalogLoaded: boolean
}

export function CommandsOverviewClient() {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    const ac = new AbortController()
    const load = () =>
      fetch("/api/commands/overview", { signal: ac.signal, cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}))
            throw new Error(
              typeof j.error === "string" ? j.error : `HTTP ${res.status}`
            )
          }
          return res.json() as Promise<OverviewResponse>
        })
        .then((r) => {
          if (stale) return
          setData(r)
          setError(null)
        })
        .catch((e) => {
          if (e instanceof Error && e.name === "AbortError") return
          if (stale) return
          setError(e instanceof Error ? e.message : "Load failed")
          setData(null)
        })

    void load()
    const t = window.setInterval(() => void load(), 5000)
    return () => {
      stale = true
      ac.abort()
      window.clearInterval(t)
    }
  }, [])

  const s = data?.stats

  return (
    <div className="space-y-6">
      {error ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {data && !data.legacyCatalogLoaded ? (
        <p className="text-xs text-muted-foreground">
          Legacy job catalog (commands.json) did not load — execution record totals
          count operator runs only.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Counts refresh every 5s. Operator execution is server-owned (in-process engine +
        Python sidecar).
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saved groups"
          value={s ? String(s.groupsCount) : "—"}
        />
        <StatCard
          label="Schedules (enabled / total)"
          value={
            s
              ? `${s.enabledSchedulesCount} / ${s.schedulesCount}`
              : "—"
          }
          description="Enabled schedules are driven by the in-process tick"
        />
        <StatCard
          label="Execution records"
          value={s ? String(s.executionRecordsTotal) : "—"}
          description="Operator + catalog"
        />
        <StatCard
          label="Operator queued / running / failed"
          value={
            s
              ? `${s.operatorQueued} / ${s.operatorRunning} / ${s.operatorFailed}`
              : "—"
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Operator completed (24h)"
          value={s ? String(s.operatorCompletedLast24h) : "—"}
        />
        <StatCard
          label="Catalog queued / running / failed"
          value={
            s
              ? `${s.legacyQueued} / ${s.legacyRunning} / ${s.legacyFailed}`
              : "—"
          }
          description="From commands.json history"
        />
        <StatCard
          label="Operator runs"
          value={s ? String(s.operatorRunsCount) : "—"}
        />
        <StatCard
          label="Catalog jobs"
          value={s ? String(s.legacyCatalogCount) : "—"}
        />
      </div>

      <SectionCard
        title="Quick links"
        description="Jump to the main operator workflows in this section."
      >
        <div className="flex flex-wrap gap-2 p-5 pt-0">
          <Link
            href="/commands/run-now"
            className={buttonVariants({ size: "sm" })}
          >
            Run now
          </Link>
          <Link
            href="/commands/groups"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Groups
          </Link>
          <Link
            href="/commands/schedules"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Schedules
          </Link>
          <Link
            href="/commands/runs"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Runs
          </Link>
        </div>
      </SectionCard>
    </div>
  )
}
