# UI foundation — internal guidelines

This document captures Day-1 layout rules so pages stay consistent. Prefer editing shared primitives over one-off Tailwind on screens.

## Spacing rhythm

- **Page canvas**: `space-y-6` between major vertical blocks inside the dashboard main area (shell provides `px-4 py-6` / `sm:px-6`).
- **Section internals**: default `SectionCard` body uses `px-5 py-4`; keep nested components aligned to that padding rather than adding extra outer margins.
- **Dense controls** (toolbar, filter bar): vertical padding around `py-2` / `py-2.5`; horizontal `px-3` for table chrome.
- **Gaps**: use `gap-2` for control clusters, `gap-4` for stat grids, `gap-6` for two-column sections.

## Page structure order

1. `PageHeader` (title, optional subtitle, optional actions).
2. `FilterBar` when the screen is primarily a list or filterable view.
3. One or more `SectionCard` blocks wrapping primary content.
4. Inside list sections: `TableShell` → `TableToolbar` → table or `TableEmpty` → `TablePagination`.

## Card usage

- **SectionCard**: default wrapper for page content blocks (titles, descriptions, primary actions in the header row).
- **StatCard**: KPI tiles only; keep labels short and values tabular.
- **TableShell**: list/table chrome only; do not nest arbitrary marketing-style cards inside it.

## Table usage

- Always compose list UIs with `TableShell` + `TableToolbar` + shadcn `Table` + `TablePagination`.
- Empty datasets: use `TableEmpty` (built on `EmptyState`) so empty and filled states share width and tone.
- **Connectivity** is the **canonical** operational table: dense columns, `FilterBar` + toolbar search, row actions, details sheet, skeleton loading, pagination with rows-per-page, empty and no-match states. **Meters** follows the same pattern for registry-specific fields.
- **Commands** adds a **workflow layout**: request panel + jobs table (same table chrome as Connectivity) + inline selected-job detail with per-meter results; use this when the screen is process-oriented, not list-only.
- Shared detail layout primitives: `DetailBlock` and `DlGrid` in `components/shared/entity-detail-blocks.tsx`.

## Badges

- Use **StatusBadge** for operational states (online, pending, failed, etc.).
- Map domain states to variants: `success`, `warning`, `danger`, `neutral`, `info`. Avoid raw `Badge` on operational screens unless there is a strong reason.

## Buttons

- Primary actions: `Button` default variant, `size="sm"` in headers and toolbars.
- Secondary actions: `variant="outline"` or `variant="secondary"`; keep pairs aligned in `PageHeader` actions or toolbar right slot.
- Disabled placeholders are acceptable in the foundation phase; still use real `Button` components for consistent height and focus rings.

## No ad-hoc per-page styling

- Do not introduce new card borders, radii, or shadow styles on individual pages.
- If a pattern repeats twice, extract it to `components/shared` or `components/data-table`.
- Prefer design tokens (`border-border`, `bg-card`, `text-muted-foreground`) over raw hex or one-off grays.
