"use client"

import { useMemo, useState } from "react"

import { FilterSelect } from "@/components/shared/filter-select"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { commandTemplateOptions } from "@/lib/mock/commands"
import type { CommandTemplateId } from "@/types/command"

type TargetScope = "single_meter" | "selected_meters" | "group"

type CommandRequestPanelProps = {
  onQueued?: (reference: string) => void
}

const scopeOptions: { id: TargetScope; label: string; hint: string }[] = [
  {
    id: "single_meter",
    label: "Single meter",
    hint: "One serial or meter ID",
  },
  {
    id: "selected_meters",
    label: "Selected meters",
    hint: "From registry selection (mock)",
  },
  {
    id: "group",
    label: "Group / route",
    hint: "Cohort dispatch (placeholder)",
  },
]

export function CommandRequestPanel({ onQueued }: CommandRequestPanelProps) {
  const [scope, setScope] = useState<TargetScope>("single_meter")
  const [singleTarget, setSingleTarget] = useState("SN-448821")
  const [templateId, setTemplateId] = useState<CommandTemplateId>(
    "on_demand_read"
  )
  const [note, setNote] = useState("")
  const [priority, setPriority] = useState<string>("normal")

  const template = useMemo(
    () => commandTemplateOptions.find((t) => t.id === templateId),
    [templateId]
  )

  const targetSummary = useMemo(() => {
    if (scope === "single_meter")
      return singleTarget.trim() || "— (enter target)"
    if (scope === "selected_meters") return "3 meters (mock selection)"
    return "North region cohort (mock)"
  }, [scope, singleTarget])

  function handleSubmit() {
    const ref = `CMD-mock-${Date.now().toString(36).toUpperCase()}`
    onQueued?.(ref)
  }

  return (
    <SectionCard
      title="New command request"
      description="UI-only draft form. Submit does not create jobs in the catalog or call execution — use the jobs table feed from /api/commands for read-only history."
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">
            Target scope
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {scopeOptions.map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  "flex cursor-pointer flex-col rounded-lg border px-3 py-2 transition-colors",
                  scope === opt.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="cmd-scope"
                    checked={scope === opt.id}
                    onChange={() => setScope(opt.id)}
                    className="size-3.5 accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground">
                    {opt.label}
                  </span>
                </div>
                <span className="mt-1 pl-5 text-xs text-muted-foreground">
                  {opt.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {scope === "single_meter" ? (
          <div className="space-y-1.5">
            <label
              htmlFor="cmd-single-target"
              className="text-xs font-medium text-muted-foreground"
            >
              Meter ID or serial
            </label>
            <Input
              id="cmd-single-target"
              value={singleTarget}
              onChange={(e) => setSingleTarget(e.target.value)}
              placeholder="e.g. hes-mt-10021 or SN-448821"
              className="h-9"
            />
          </div>
        ) : null}

        <FilterSelect
          id="cmd-template"
          label="Command template"
          value={templateId}
          onChange={(v) => setTemplateId(v as CommandTemplateId)}
          options={commandTemplateOptions.map((t) => ({
            value: t.id,
            label: `${t.label} · ${t.commandType}`,
          }))}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="cmd-note"
            className="text-xs font-medium text-muted-foreground"
          >
            Reason / note (optional)
          </label>
          <textarea
            id="cmd-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason or ticket reference for the request log…"
            rows={3}
            className={cn(
              "w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none",
              "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            )}
          />
        </div>

        <FilterSelect
          id="cmd-priority"
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />

        <div className="rounded-lg border border-border bg-muted/15 px-3 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Review
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            <li>
              <span className="text-muted-foreground">Scope: </span>
              {scopeOptions.find((s) => s.id === scope)?.label}
            </li>
            <li>
              <span className="text-muted-foreground">Target(s): </span>
              {targetSummary}
            </li>
            <li>
              <span className="text-muted-foreground">Template: </span>
              {template?.label ?? templateId}
            </li>
            <li>
              <span className="text-muted-foreground">Type: </span>
              {template?.commandType ?? "—"}
            </li>
            <li>
              <span className="text-muted-foreground">Priority: </span>
              {priority}
            </li>
          </ul>
        </div>

        <Button type="button" className="w-full sm:w-auto" onClick={handleSubmit}>
          Submit to queue (mock)
        </Button>
      </div>
    </SectionCard>
  )
}
