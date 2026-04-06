/**
 * Shared layout tokens for operational list pages and detail sheets.
 * Import into feature components; avoid duplicating long class strings.
 */

/** Right-edge sheet: standard width for entity inspection. */
export const operationalSheetContentNarrow =
  "flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-lg"

/** Wider sheet when nested tables need horizontal room (e.g. command job). */
export const operationalSheetContentWide =
  "flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md md:max-w-xl lg:max-w-2xl"

export const operationalSheetHeader =
  "border-b border-border px-5 py-4 text-left"

export const operationalSheetBodyScroll =
  "flex flex-col gap-5 px-5 py-4"

/** Sheet header when no row is selected (no bottom rule). */
export const operationalSheetHeaderPlaceholder = "px-5 py-4 text-left"

/**
 * Vertical rhythm between optional action strip, `FilterBar`, and primary
 * `SectionCard` on operational list pages.
 */
export const operationalListPageStackClass = "flex flex-col gap-4"

/** Kebab trigger in the Actions column — use on DropdownMenuTrigger. */
export const operationalRowActionTriggerClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"

/** Technical IDs in tables (meter, alarm, job, user id). */
export const operationalMonoIdTriggerClass =
  "text-left font-mono text-sm font-medium text-foreground underline-offset-4 hover:underline"

/** Human-readable row title links where monospace is too harsh. */
export const operationalTextTriggerClass =
  "text-left text-sm font-medium text-foreground underline-offset-4 hover:underline"
