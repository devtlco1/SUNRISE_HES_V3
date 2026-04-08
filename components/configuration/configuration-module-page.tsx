import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import {
  configurationHubHref,
  getConfigurationModule,
  PLACEHOLDER_READY_LINE,
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
            All configuration
          </Link>
        }
      />
      <SectionCard title="Intent">
        <p className="text-sm text-muted-foreground">{mod.domainNote}</p>
        <p className="mt-3 text-sm text-foreground">{PLACEHOLDER_READY_LINE}</p>
      </SectionCard>
    </div>
  )
}
