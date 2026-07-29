# UI: Tailwind + shadcn/ui, design tokens, next-intl (Bulgarian)

**Context.** v1 competes on the speed and polish of the core loop and on Bulgarian-market fit (ADR-0008). The UI is form-heavy and data-dense (Kanban board, customer/vehicle/line-item/invoice tables), and it must be correct for Bulgarian language, formatting, and currency.

**Decision.**
- **Tailwind CSS + shadcn/ui** — Radix primitives copied into the repo and owned (no dependency lock), with **design tokens as CSS variables**. shadcn's forms (react-hook-form + Zod) and tables (TanStack Table) match the two things we build most, and align with the validation choice (ADR-0016).
- **next-intl** with **Bulgarian as the default and only shipped locale in v1**, but all UI strings routed through message catalogs from day one so adding a language later is trivial. A Cyrillic-covering font (e.g. Inter).
- **Money is stored and computed as integer minor units with an explicit currency** (ADR-0011); all number/date/currency display goes through `Intl` with the Bulgarian locale. The definitive invoicing-currency rules (BGN/EUR, euro-adoption dual display) belong to the GF-14/GF-17 invoicing ADRs, not here.

**Consequences.** Owning the component source fits the self-hosted, cost-conscious posture and gives full token control. Structuring i18n now avoids a painful retrofit. Currency-agnostic money handling lets the invoicing layer implement EUR/BGN and any transition rules without reworking storage. Mantine (batteries-included) was considered and set aside in favour of shadcn's ownership and token control.

**Update (2026-07).** The concrete token values are synced from the **SnowUI Dashboard Design System** (Figma) — near-black primary, neutral grey scale, off-white surfaces, 8px radius, and a fixed pastel accent palette for status/charts. SnowUI's 4px spacing base and Inter type ramp already match Tailwind's defaults, so only colours + radius are overridden. The Figma-token → CSS-token map and the component-port playbook live in [`docs/design-system.md`](../design-system.md). This refines the token *values* only; the Tailwind-v4 + owned-shadcn architecture above is unchanged.
