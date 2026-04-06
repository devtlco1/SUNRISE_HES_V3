import { CommandsWorkspace } from "@/components/commands/commands-workspace"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { mockCommandJobs } from "@/lib/mock/commands"

const useMockCommands = process.env.NEXT_PUBLIC_COMMANDS_USE_MOCK === "true"

export default function CommandsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Commands"
        subtitle={
          useMockCommands
            ? "Static job catalog (mock mode). Clear NEXT_PUBLIC_COMMANDS_USE_MOCK to use the read-only /api/commands feed."
            : "Read-only job history from /api/commands. The request panel is UI-only and does not enqueue or execute work."
        }
        actions={
          <>
            <Button type="button" size="sm" variant="outline" disabled>
              Export audit (mock)
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled>
              Job policies (mock)
            </Button>
          </>
        }
      />

      <CommandsWorkspace jobs={useMockCommands ? mockCommandJobs : undefined} />
    </div>
  )
}
