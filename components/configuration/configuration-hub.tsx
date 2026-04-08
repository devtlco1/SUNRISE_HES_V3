import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { configurationModuleHref, configurationModules } from "@/lib/configuration/modules"
import { cn } from "@/lib/utils"

export function ConfigurationHub() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configuration" />
      <SectionCard title="Modules">
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {configurationModules.map((mod) => {
            const href = configurationModuleHref(mod)
            const Icon = mod.icon
            return (
              <li key={mod.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors",
                    "hover:border-foreground/20 hover:bg-muted/40"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                      {mod.title}
                    </span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {mod.summary}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </SectionCard>
    </div>
  )
}
