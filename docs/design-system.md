# GarageFlow design system

GarageFlow's UI is **Tailwind CSS v4 + shadcn/ui (new-york)** with design tokens as
CSS variables (ADR-0017). The visual language is synced from the **SnowUI Dashboard
Design System** in Figma.

- **Figma file:** `Dashboard Design System (Community)` — key `s1v1vMrM0heDM1A8o5UB72`
  - Tokens page — node `4317:63990`
  - Components page — node `1246:28355`
  - Page examples — node `913:3655`
- **Single source of truth for tokens:** [`src/app/globals.css`](../src/app/globals.css)
- **Component primitives:** [`src/components/ui/`](../src/components/ui/)

## Token model

SnowUI splits colour into two layers; we mirror that in `globals.css`:

1. **Themes (semantic)** — swap between `:root` (light) and `.dark`. Neutrals are
   pure greys (`oklch` hue 0, chroma 0), which is SnowUI's Black/White opacity scale
   composited onto the surface.
2. **Color styles (fixed)** — the pastel accent palette + tints, defined once in
   `@theme` and identical in light and dark. Use for status labels, tags, charts.

Components must reference the **mapped Tailwind utilities** (`bg-background`,
`text-muted-foreground`, `bg-primary`, `bg-accent-green/20`, …), never raw colours.

### Semantic tokens (Figma → CSS var → utility)

| SnowUI (Figma)            | CSS var (`:root`)        | Utility                       | Light        |
| ------------------------- | ------------------------ | ----------------------------- | ------------ |
| Background/2 `#f9f9fa`     | `--background`           | `bg-background`               | off-white    |
| Black/100                 | `--foreground`           | `text-foreground`             | near-black   |
| Background/1 `#ffffff`     | `--card` / `--popover`   | `bg-card` / `bg-popover`      | white        |
| Primary (SnowUI-Light)    | `--primary`              | `bg-primary`                  | near-black   |
| Black/4                   | `--secondary` / `--muted`| `bg-secondary` / `bg-muted`   | `#f5f5f5`    |
| Black/40                  | `--muted-foreground`     | `text-muted-foreground`       | grey text    |
| Color 2 `#edeefc`          | `--accent`               | `bg-accent`                   | lavender tint|
| Black/10                  | `--border` / `--input`   | `border` / `border-input`     | `#e6e6e6`    |

Dark mode redefines each of these in `.dark`; primary becomes SnowUI's lavender.
`--sidebar-*` mirrors the same roles for the navigation surface.

**Radius:** `--radius: 0.5rem` (SnowUI Radius/8). Utilities: `rounded-sm` 4px,
`rounded-md` 6px, `rounded-lg` 8px (controls), `rounded-xl` 12px, `rounded-2xl` 16px
(cards).

### Fixed accent palette ("Color styles")

| Utility base        | Hex        | Use                          |
| ------------------- | ---------- | ---------------------------- |
| `accent-cyan`       | `#a0bce8`  | chart / tag                  |
| `accent-mint`       | `#6be6d3`  | chart / tag                  |
| `accent-blue`       | `#7dbbff`  | chart / tag, `Badge info`    |
| `accent-purple`     | `#b899eb`  | chart / tag, `Badge accent`  |
| `accent-green`      | `#71dd8c`  | chart / tag, `Badge success` |
| `accent-orange`     | `#ffb55b`  | chart / tag, `Badge warning` |
| `tint-blue`         | `#e6f1fd`  | subtle selected/hover fill   |
| `tint-lavender`     | `#edeefc`  | subtle selected/hover fill   |
| `chart-1..5`        | pastels    | data-viz series aliases      |

Status badges tint at `/20` opacity with `text-foreground` so they stay legible in
both themes (see `badge.tsx`).

### Spacing & type — already aligned

SnowUI's **4px spacing base** and **Inter type ramp** (12/16, 14/20, 24/32) match
Tailwind's defaults, so there are no custom spacing/type tokens. Dashboard body text
is `text-sm` (14px); section titles `text-2xl font-semibold` (24/32). Inter is loaded
with the `cyrillic` subset in `layout.tsx` (Bulgarian UI — do not drop it).

## Porting a SnowUI component (Phase 2+ playbook)

Components are ported group by group, one PR per group. For each component:

1. **Read the Figma node.** Load the `/figma-design-to-code` skill, then
   `get_design_context` on the component's node (find it under the Components page
   `1246:28355` via `get_metadata`). Use `get_screenshot` for a visual reference and
   `get_variable_defs` for exact bound values (select the node in desktop Figma if the
   remote call reports "nothing selected").
2. **Author to our conventions**, not the emitted code:
   - one file per component in `src/components/ui/`, kebab-case
   - React 19 style — `ComponentProps<"…">`, **no `forwardRef`**
   - variants via `cva` + `VariantProps`; merge classes with `cn()` (`@/lib/utils`)
   - reference token utilities only; map any new SnowUI colour to a token first
   - export the component and its `…Variants` object (see `button.tsx`)
3. **Keep it token-driven.** If the component needs a colour/size not covered by a
   token, add the token to `globals.css` in the same PR and record it in the tables
   above — never hard-code a hex in a component.
4. **Verify** in the running app (`/verify`), light and dark, before committing.

### Suggested phase order

| Phase | Group          | Components                                             |
| ----- | -------------- | ----------------------------------------------------- |
| 1 ✅  | Foundation     | tokens, Button, Card, Input, Label, Badge, Separator  |
| 2 ✅  | Forms          | Select, Checkbox, Radio, Switch, Textarea, Field      |
| 3 ✅  | Data display   | Table, Avatar, Tabs, Tooltip, Progress                |
| 4 ✅  | Navigation     | Sidebar/Nav, Breadcrumb, Dropdown menu, Pagination    |
| 5 ✅  | Overlays       | Dialog, Sheet, Popover, Toast/Notification            |
| 6 ✅  | Charts         | LineChart, BarChart, DonutChart                       |

Radix primitives (per ADR-0017) can back the interactive components in phases 2–5;
add the `@radix-ui/*` packages as each group needs them.

### Phase 2 — Forms

`Select`, `Checkbox`, `RadioGroup`, `Switch` are backed by the matching
`@radix-ui/react-*` primitive; `Textarea` is a plain element mirroring `Input`.
Icons come from **`lucide-react`** (the icon library declared in `components.json`):
`Check` (checkbox / select item), `Circle` (radio dot), `ChevronsUpDown` (select
trigger, matching SnowUI's up/down affordance). All controls stay token-driven and
add **no new tokens** — checked states use `primary`, surfaces `card`/`popover`,
and the error state (`aria-invalid`) uses a `destructive` border.

- **Radio** has no distinct SnowUI source (the kit ships CheckBox + Switch only),
  so `RadioGroupItem` mirrors the Checkbox treatment as a circle.
- **`Field`** is the label + control + error/description wrapper. It does the a11y
  wiring once (`htmlFor`, `aria-invalid`, `aria-describedby`) and takes a plain
  `error` string, so it drops into react-hook-form + Zod (ADR-0016) without adding
  a form-library dependency. Checkbox/Switch, whose label sits beside the control,
  compose `Label` + control inline instead of using `Field`'s vertical layout.

### Phase 4 — Navigation

`Sidebar`, `Breadcrumb`, `DropdownMenu`, and `Pagination` provide the app's
navigation surface. All are token-driven using the existing `--sidebar-*` tokens
and standard semantic tokens (`popover`, `border`, `accent`).

- **Sidebar** — left navigation panel using `--sidebar-*` tokens. Composes a
  context provider (`SidebarProvider`) for open/collapsed state, plus presentational
  primitives: `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`,
  `SidebarGroup`, `SidebarMenu`, `SidebarMenuLink` (with `active` variant for the
  current page), `SidebarTrigger` (hamburger toggle), and `SidebarSeparator`.
  Width is 256px expanded, 64px collapsed.
- **Breadcrumb** — hierarchical trail showing the user's location. Uses
  `text-muted-foreground` for inactive items, `text-foreground` for the current
  page, and `ChevronRight` separators. Includes `BreadcrumbEllipsis` for
  truncated paths.
- **DropdownMenu** — backed by `@radix-ui/react-dropdown-menu` (ADR-0017).
  Supports items, checkbox/radio items, sub-menus, labels, separators, and
  keyboard shortcuts. Uses `popover` surface, `accent` fill on hover/selected.
- **Pagination** — page navigation controls using `buttonVariants` for consistent
  affordance. `PaginationLink` supports `isActive` (renders as `outline` variant)
  and `size` props. Includes `PaginationPrevious`, `PaginationNext`, and
  `PaginationEllipsis`.

All navigation components add **no new tokens** — they reuse existing sidebar,
popover, border, and accent tokens.

### Phase 5 — Overlays

`Dialog`, `Sheet`, `Popover`, and `Toast` provide modal and non-modal overlay
surfaces for confirmations, side panels, floating content, and notifications.
All are token-driven using existing `card`, `popover`, `border`, and semantic
tokens.

- **Dialog** — modal overlay backed by `@radix-ui/react-dialog` (ADR-0017).
  Uses `card` surface with `border`, centered on screen with a backdrop.
  Includes `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`,
  `DialogDescription`, and `DialogClose` components. The close button (X icon)
  is positioned absolutely in the top-right corner.
- **Sheet** — side panel overlay using the same Dialog primitive. Slides in
  from `top`, `right` (default), `bottom`, or `left` via the `side` variant.
  Uses `card` surface with directional borders. Components mirror Dialog:
  `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`,
  `SheetDescription`. Width is 75% (max 384px on sm+) for left/right sheets.
- **Popover** — non-modal overlay backed by `@radix-ui/react-popover`.
  Uses `popover` surface with `border`, positioned relative to its trigger.
  No backdrop, closes on outside click. Includes `PopoverContent` (with
  configurable `align` and `sideOffset`) and `PopoverAnchor` for advanced
  positioning.
- **Toast** — notification overlay backed by `@radix-ui/react-toast`.
  Token-driven variants: `default` (card surface), `destructive` (error state),
  `success` (accent-green tint). Slides in from bottom-right. Includes
  `Toaster` (viewport renderer), `useToast` hook for imperative API, and
  `ToastAction` for interactive buttons. Use `ToastProvider` at app root.

All overlay components add **no new tokens** — they reuse existing card,
popover, border, destructive, and accent-green tokens.

### Phase 6 — Charts

`LineChart`, `BarChart`, and `DonutChart` provide data visualization using the
**Recharts** library (lightweight, self-hostable, React-native). All charts
are token-driven using the existing `chart-1..5` color aliases that map to
the SnowUI pastel palette.

- **LineChart** — time-series and trend visualization. Accepts an array of
  data objects, multiple line series via the `lines` prop (each with `dataKey`,
  optional `name`, and `color` mapped to `chart-1..5`), and the `xAxisKey` for
  the horizontal axis. Supports optional grid (`showGrid`), legend (`showLegend`),
  and custom `height`. Uses `monotone` curves with 2px stroke width and dot
  markers. Colors auto-cycle through `chart-1..5` if not specified.
- **BarChart** — categorical comparisons and distributions. Similar API to
  LineChart but with `bars` prop instead of `lines`. Supports both `horizontal`
  (default) and `vertical` layouts. Bars have 4px top border radius and use
  the `chart-1..5` palette. Hover cursor shows accent fill.
- **DonutChart** — proportional relationships with a hollow center. Takes
  `data` as an array of `{name, value}` objects. Configurable `innerRadius`
  (default 60) and `outerRadius` (default 100) for the donut thickness.
  Optional `colors` array to override the default `chart-1..5` sequence.
  Uses 2px padding angle between segments and includes label lines.

All chart components:
- Use CSS token references (e.g., `hsl(var(--color-chart-1))`) so they adapt
  to light/dark themes automatically
- Style tooltips with `popover` surface, `border`, and `foreground` colors
- Style axes and grid lines with `border` and `muted-foreground` colors
- Accept a `className` prop for layout control (e.g., positioning within a card)
- Default to 300px height but accept a custom `height` prop
- Add **no new tokens** — they consume the `chart-1..5` aliases already defined
  in `globals.css`

Example usage:

```tsx
<LineChart
  data={monthlyData}
  lines={[
    { dataKey: "revenue", name: "Revenue", color: "chart-1" },
    { dataKey: "expenses", name: "Expenses", color: "chart-2" },
  ]}
  xAxisKey="month"
/>
```
