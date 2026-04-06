"use client"

import { CommandJobDetailContent } from "@/components/commands/command-job-detail-content"
import {
  operationalSheetBodyScroll,
  operationalSheetContentWide,
  operationalSheetHeader,
} from "@/lib/ui/operational"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { CommandJobRow } from "@/types/command"

type CommandJobDetailsSheetProps = {
  job: CommandJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandJobDetailsSheet({
  job,
  open,
  onOpenChange,
}: CommandJobDetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={operationalSheetContentWide}
        showCloseButton
      >
        <SheetHeader className={operationalSheetHeader}>
          <SheetTitle>Command job</SheetTitle>
          <SheetDescription>
            {job ? job.id : "Select a job to inspect"}
          </SheetDescription>
        </SheetHeader>
        <div className={operationalSheetBodyScroll}>
          <CommandJobDetailContent job={job} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
