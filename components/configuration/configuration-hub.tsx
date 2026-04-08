import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { configurationModuleHref, configurationModules } from "@/lib/configuration/modules"
import { cn } from "@/lib/utils"

export function ConfigurationHub() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configuration" />
      <ul className="flex flex-col gap-1">
        {configurationModules.map((mod) => {
          const href = configurationModuleHref(mod)
          return (
            <li key={mod.id}>
              <Link
                href={href}
                className={cn(
                  "block rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors",
                  "hover:bg-muted/60"
                )}
              >
                {mod.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
