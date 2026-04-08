import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import {
  configurationHubHref,
  getConfigurationModule,
  type ConfigurationModuleId,
} from "@/lib/configuration/modules"
import { cn } from "@/lib/utils"

type ConfigurationModulePageProps = {
  moduleId: ConfigurationModuleId
}

export function ConfigurationModulePage({ moduleId }: ConfigurationModulePageProps) {
  const mod = getConfigurationModule(moduleId)

  return (
    <div className="space-y-6">
      <PageHeader
        title={mod.title}
        actions={
          <Link
            href={configurationHubHref}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            )}
          >
            Configuration
          </Link>
        }
      />
      <p className="text-sm text-muted-foreground">Not implemented yet.</p>
    </div>
  )
}
