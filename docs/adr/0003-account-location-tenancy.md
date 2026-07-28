# Tenancy: Account owns Locations; all data scopes to Location

**Context.** The MVP targets single-shop garages, but the Premium tier promises multiple branches. Scoping MVP data directly to a single garage would force a schema-wide migration (introduce a location scope on every table, backfill everything) the moment branches ship.

**Decision.** The paying tenant is an **Account**. An Account owns one or more **Locations** (branches). All operational data (Customers, Vehicles, Repair Orders, Invoices, Appointments, Users) scopes to a Location. In the MVP each Account has exactly one Location, and the Location concept is hidden from the UI.

**Consequences.** Every query carries a Location scope from day one — a small, constant complexity tax now in exchange for shipping branches later as a feature, not a migration. Cross-location reporting (owner dashboard across branches) becomes an Account-level rollup later. The UI must not leak the Location concept until multi-location is a real feature.
