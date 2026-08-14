# UI System

Target: the density and calm of Linear / Ramp / Rippling — an operational tool people use all day, not an admin template. Desktop-first (1440+), responsive to 375px.

## Tokens

Tailwind v4, CSS-first. All tokens are declared in `src/app/globals.css` under `@theme` and as CSS variables that flip for dark mode. Components reference semantic names (`--color-surface`), never raw palette values.

### Surfaces
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-canvas` | `zinc-50` | `zinc-950` | Page background |
| `--color-surface` | `white` | `zinc-900` | Cards, tables, panels |
| `--color-surface-raised` | `white` | `zinc-800` | Popovers, dropdowns, modals |
| `--color-surface-sunken` | `zinc-100` | `zinc-950` | Table headers, inset areas |
| `--color-border` | `zinc-200` | `zinc-800` | Default border |
| `--color-border-strong` | `zinc-300` | `zinc-700` | Inputs, focus targets |

### Text
`--color-text` (primary) · `--color-text-muted` (labels, metadata) · `--color-text-subtle` (placeholders, disabled)

All pairings meet WCAG AA (≥4.5:1) in both themes.

### Accent
Indigo. `--color-accent` for primary actions, `--color-accent-soft` for the tint behind selected nav and AI panels.

### Status
| State | Tone | Icon |
|---|---|---|
| Draft | slate | `PencilLine` |
| Submitted | blue | `Send` |
| In review | amber | `Clock` |
| Approved | emerald | `CheckCircle2` |
| Rejected | rose | `XCircle` |
| Returned | orange | `Undo2` |
| Canceled | slate | `Ban` |

**Status is never conveyed by colour alone.** Every badge carries icon + text label + tooltip, defined once in `src/types/domain.ts` (`STATUS_META`, `PRIORITY_META`, `RISK_META`) and consumed everywhere. Adding a status means editing one map.

## Scale

- **Spacing** — 4px base. Card padding 20px, page gutter 24px, section gap 24px.
- **Radius** — 6px controls, 10px cards, 999px pills.
- **Type** — Geist Sans. 12px metadata / 13px table body / 14px body / 16px section / 20px page title. Tabular numerals for every figure so columns align.
- **Elevation** — one shadow for popovers, one for modals. Cards use borders, not shadows.

## Density

Enterprise tools are read, not admired. Table rows are 40px with 12px cell padding — roughly 18 rows visible at 1080p without scrolling. Numeric columns right-aligned and tabular. Row hover is a background shift, not a transform.

## Components

`src/components/ui/` — built in-repo on the shadcn/ui pattern (composition + `cva` variants + `cn()` merge), no runtime dependency:

`Button` `Input` `Textarea` `Select` `Checkbox` `Badge` `StatusBadge` `RiskBadge` `PriorityBadge` `Card` `DataTable` `Tabs` `Dialog` `Sheet` `DropdownMenu` `Tooltip` `Avatar` `Progress` `Skeleton` `EmptyState` `ErrorState` `Alert` `Toast` `Pagination` `DateField` `MoneyInput` `FilterBar` `Timeline` `Stat`

## Charts

Recharts, wrapped in `<ChartCard>` which enforces the parts a chart needs to be useful: title, headline metric, period-over-period comparison, tooltip, empty state, and a filter hook. A chart with no title or no comparison does not ship.

Series colours come from a fixed 8-colour categorical ramp that holds contrast in both themes. Sequential data uses a single-hue ramp. Colour is never the only encoding — bars carry labels, lines carry a legend with values.

## States

Every list and panel implements four:

| State | Treatment |
|---|---|
| Loading | Skeleton matching the final layout — no spinners, no layout shift |
| Empty | Icon + one-line explanation + the action that resolves it |
| Error | What failed, and the recovery action. Typed: permission / not found / AI unavailable / validation |
| Populated | The real thing |

## Accessibility

- Every interactive element is reachable and operable by keyboard; focus ring is a 2px accent outline with offset, never removed.
- Dialogs and sheets trap focus, close on `Escape`, and restore focus to the trigger.
- Every input has a `<label>`; errors are tied via `aria-describedby` and announced with `role="alert"`.
- Tables use real `<th scope>`; sortable headers expose `aria-sort`.
- Icon-only buttons carry `aria-label`.
- Live regions announce action results ("Request approved").

## Responsive

| Width | Layout |
|---|---|
| ≥1280 | Sidebar + 3-column request detail |
| 1024–1279 | Sidebar + 2-column (AI panel below content) |
| 768–1023 | Collapsed icon sidebar, single column, tables scroll horizontally in their own container |
| <768 | Sheet navigation, stacked cards; dense tables become card lists |

The page body never scrolls horizontally — wide tables scroll inside their own `overflow-x` container.

## Dark mode

Class-based (`.dark` on `<html>`), three states: light / dark / system. The choice is written to `localStorage` and applied by an inline script before paint, so there is no flash. Every token has both values; no component hardcodes a colour.
