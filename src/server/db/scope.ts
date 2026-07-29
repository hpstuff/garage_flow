/**
 * The tenant Scope (ADR-0003, ADR-0013).
 *
 * A `Scope` is a *branded* type: the only way to obtain one is
 * `scopeFromSession`, which an adapter calls after resolving a Better Auth
 * session (ADR-0014). Because services require a `Scope`, an un-scoped query is
 * a compile-time error, not a code-review catch.
 *
 * In v1 each Account has exactly one Location (ADR-0003), so `locationId` is
 * derived from the active Account; the shape already carries it so multi-branch
 * ships as a feature, not a migration.
 */

export const ROLES = ["owner", "manager", "front-desk"] as const;
export type Role = (typeof ROLES)[number];

/** Better Auth stores membership roles as free text; map unknowns to the least-privileged role. */
export function toRole(value: string | null | undefined): Role {
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "front-desk";
}

declare const scopeBrand: unique symbol;

export type Scope = {
  readonly accountId: string;
  readonly locationId: string;
  readonly role: Role;
} & { readonly [scopeBrand]: "Scope" };

/** The plain shape an adapter resolves from a session before branding it. */
export interface ResolvedSession {
  accountId: string;
  locationId: string;
  role: Role;
}

/** The sole constructor of a `Scope` (ADR-0013). */
export function scopeFromSession(session: ResolvedSession): Scope {
  return {
    accountId: session.accountId,
    locationId: session.locationId,
    role: session.role,
  } as Scope;
}
