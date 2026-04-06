# UI foundation — HES operational dashboard

Guidelines for layout, rhythm, and shared primitives. Prefer editing tokens in `lib/ui/operational.ts` and shared components over one-off Tailwind on screens.

## Page canvas

- **Main column**: The shell provides horizontal padding (`px-4 py-6` / `sm:px-6`). Inside the route, stack major blocks with `space-y-6` (typically `PageHeader` then page body).
- **List / filter pages**: Wrap the action strip (if any), `FilterBar`, and primary `SectionCard` in `operationalListPageStackClass` (`flex flex-col gap-4`) so spacing matches across Meters, Connectivity, Alarms, Users, and the Commands jobs column.

## Page headers (`PageHeader`)

- **Title**: `text-xl font-semibold tracking-tight`.
- **Subtitle**: `text-sm` muted, relaxed line height, `text-pretty`, up to `max-w-3xl`. Operational, calm wording; state clearly when data is mock or disconnected.
- **Actions**: `size="sm"` buttons, `gap-2`, right-aligned and wrapping on small viewports. Placeholder actions stay real `Button` components (often `disabled`) for consistent height and focus rings.

## Operational action strips (`OperationalActionStrip`)

- Use for compact bulk or directory chrome **above** the `FilterBar` (Alarms triage, Users directory).
- Uppercase label (`text-xs font-semibold tracking-wide text-muted-foreground`) + `gap-2` control row; container matches `rounded-lg border border-border bg-muted/15 px-3 py-2.5` with responsive `sm:flex-row sm:items-center sm:justify-between`.

## Filters (`FilterBar`)

- Dashed border panel: `min-h-10`, `gap-2`, `px-3 py-2.5`, `bg-muted/25`.
- Inner layout: `gap-3` grids for `FilterSelect` columns; optional outline **Clear filters** aligned to the end on large screens (same pattern as list pages).

## Tables

- **Composition**: `SectionCard` → `TableShell` → `TableToolbar` → `Table` (or skeleton / empty) → `TablePagination`.
- **Toolbar**: `border-b`, `bg-muted/20`, `px-3 py-2.5`, search `Input` height `h-8`, icon offset `left-2.5`.
- **Primitives** (`components/ui/table.tsx`): Header cells use `h-10`, `bg-muted/25`, `px-3`, `text-sm font-medium`. Body cells use `px-3 py-2.5`, `text-sm`. Do **not** repeat `bg-muted/25` on individual `TableHead` cells.
- **Horizontal scroll**: Wrap wide tables in `relative min-w-0` + inner `min-w-[…px]` to keep pagination and shell aligned.
- **Header row**: `TableRow className="hover:bg-transparent"` on operational tables.
- **Actions column**: `DropdownMenuTrigger` uses `operationalRowActionTriggerClass` (8×8 kebab control).
- **Technical IDs** (meter, alarm, job, user id as row links): `operationalMonoIdTriggerClass`; secondary-line IDs may add `cn(..., "text-xs text-muted-foreground hover:text-foreground")`.
- **Pagination** (`TablePagination`): `border-t`, `px-3 py-2.5`, summary text `text-sm`, controls `size="sm"`.

## Empty and loading states

- **Empty / no results**: `TableEmpty` (shared width and tone with filled tables). Copy should be short, operational, and mention how to verify the state (e.g. empty props) where helpful.
- **Loading**: `TableBodySkeleton` cell padding aligns with table body (`px-3 py-2.5`).

## Detail sheets (right edge)

- **Tokens** (`lib/ui/operational.ts`):
  - `operationalSheetContentNarrow` — default entity inspection (`sm:max-w-md md:max-w-lg`).
  - `operationalSheetContentWide` — nested tables (command job).
  - `operationalSheetHeader` — bordered title block (`border-b`, `px-5 py-4`, `text-left`).
  - `operationalSheetHeaderPlaceholder` — no selection (`px-5 py-4`, no border).
  - `operationalSheetBodyScroll` — scrollable body (`flex flex-col gap-5 px-5 py-4`).
- **Title / description**: Use default `SheetTitle` / `SheetDescription` (semibold title, muted description). Empty states: “Select a … row to inspect.”
- **Body**: `DetailBlock` + `DlGrid` from `entity-detail-blocks.tsx`; `Separator` between sections. Keep badge clusters in `flex flex-wrap gap-2`.

## Workflow pages (Commands)

- **Layout**: Request panel in a narrow column; filters + jobs table + inline selected-job card in the wider column; `gap-6` between major blocks inside the grid.
- **Queue notice**: Neutral bordered banner after mock submit; copy states UI-only logging.

## Badges

- **StatusBadge** for operational states. Map domain enums to `success`, `warning`, `danger`, `neutral`, `info`. Avoid raw `Badge` on operational screens unless necessary.

## Buttons and disabled placeholders

- Toolbars and strips: `size="sm"`. Mock-only header actions include `(mock)` in the label when enabled buttons would imply real side effects.

## Microcopy

- Prefer clear, enterprise tone: what the screen is for, what is mock, what will connect later. Avoid consumer-style or flashy language.

## No ad-hoc chrome

- Do not introduce new card radii, shadows, or border styles per page.
- If a pattern appears twice, move it to `components/shared`, `components/data-table`, or `lib/ui/operational.ts`.
- Use design tokens (`border-border`, `bg-card`, `text-muted-foreground`) instead of raw grays.
