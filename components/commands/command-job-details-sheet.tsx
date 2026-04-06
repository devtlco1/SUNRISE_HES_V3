"use client"

import { CommandJobDetailContent } from "@/components/commands/command-job-detail-content"
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
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-xl lg:max-w-2xl"
        showCloseButton
      >
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="text-base">Command job</SheetTitle>
          <SheetDescription className="text-sm">
            {job ? job.id : "No job loaded"}
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 py-4">
          <CommandJobDetailContent job={job} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
