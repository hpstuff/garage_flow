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
| 2     | Forms          | Select, Checkbox, Radio, Switch, Textarea, Field      |
| 3     | Data display   | Table, Avatar, Tabs, Tooltip, Progress                |
| 4     | Navigation     | Sidebar/Nav, Breadcrumb, Dropdown menu, Pagination    |
| 5     | Overlays       | Dialog, Sheet, Popover, Toast/Notification            |
| 6     | Charts         | chart wrappers using `chart-1..5`                     |

Radix primitives (per ADR-0017) can back the interactive components in phases 2–5;
add the `@radix-ui/*` packages as each group needs them.
