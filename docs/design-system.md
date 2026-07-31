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
| 3     | Data display   | Table, Avatar, Tabs, Tooltip, Progress                |
| 4 ✅  | Navigation     | Sidebar/Nav, Breadcrumb, Dropdown menu, Pagination    |
| 5     | Overlays       | Dialog, Sheet, Popover, Toast/Notification            |
| 6     | Charts         | chart wrappers using `chart-1..5`                     |

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
