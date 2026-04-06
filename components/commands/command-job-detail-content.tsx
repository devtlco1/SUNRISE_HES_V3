import { EmptyState } from "@/components/shared/empty-state"
import { StatusBadge } from "@/components/shared/status-badge"
import {
  DetailBlock,
  DlGrid,
} from "@/components/shared/entity-detail-blocks"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatMeterCommandResult,
  formatQueueState,
} from "@/lib/commands/format"
import type { CommandJobRow } from "@/types/command"
import { ListTreeIcon } from "lucide-react"

type CommandJobDetailContentProps = {
  job: CommandJobRow | null
}

/**
 * Shared job + per-meter results body for inline panel and sheet.
 * One batch job → many meter rows; each row can differ.
 */
export function CommandJobDetailContent({ job }: CommandJobDetailContentProps) {
  if (!job) {
    return (
      <EmptyState
        title="No job selected"
        description="Select a row in Recent command jobs to review the request, queue state, and per-meter outcomes."
        icon={<ListTreeIcon className="size-5" aria-hidden />}
        className="border-0 bg-transparent py-10"
      />
    )
  }

  const queue = formatQueueState(job.queueState)

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        A single request may target many meters. Each row below reflects that
        meter&apos;s outcome; mixed success and failure in one batch is
        expected.
      </div>

      <DetailBlock title="Job identity">
        <DlGrid
          items={[
            { label: "Job ID", value: job.id },
            { label: "Template", value: job.templateName },
            { label: "Command type", value: job.commandType },
            { label: "Priority", value: job.priority },
          ]}
        />
      </DetailBlock>

      <Separator />

      <DetailBlock title="Request summary">
        <DlGrid
          items={[
            {
              label: "Targets",
              value: `${job.targetCount} meter(s)`,
            },
            {
              label: "Submitted by",
              value: job.submittedBy,
            },
            {
              label: "Submitted at",
              value: (
                <span className="tabular-nums">{job.submittedAt}</span>
              ),
            },
            {
              label: "Operator note",
              value: job.operatorNote ?? "—",
            },
          ]}
        />
      </DetailBlock>

      <Separator />

      <DetailBlock title="Queue / execution summary">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={queue.variant}>{queue.label}</StatusBadge>
          <span className="text-sm text-muted-foreground">
            {job.resultSummary}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Success", job.successCount],
            ["Failed", job.failedCount],
            ["Pending", job.pendingCount],
            ["Cancelled", job.cancelledCount],
          ].map(([label, n]) => (
            <div key={label} className="rounded-md border border-border bg-background/60 px-2 py-2">
              <dt className="text-[11px] font-medium text-muted-foreground uppercase">
                {label}
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {n}
              </dd>
            </div>
          ))}
        </dl>
      </DetailBlock>

      <Separator />

      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Per-meter results
        </h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Meter ID</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="min-w-[200px]">Response summary</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.meterResults.map((m) => {
                const st = formatMeterCommandResult(m.state)
                return (
                  <TableRow key={`${job.id}-${m.meterId}`}>
                    <TableCell className="font-medium">{m.meterId}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {m.serialNumber}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={st.variant}>{st.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm text-foreground">
                      {m.responseSummary}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {m.updatedAt}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
