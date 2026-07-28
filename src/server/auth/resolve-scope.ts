/**
 * session → { account, active location, role } (ADR-0014).
 *
 * This small mapping is "our own code and the sole source of a `scope`". It is
 * the one place that touches the unscoped `db` directly — it cannot itself be
 * scoped, because it is what *determines* the scope. Everything downstream goes
 * through ScopedDb.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { location, member } from "../db/schema";
import { type Scope, scopeFromSession, toRole } from "../db/scope";
import { NotFoundError } from "../domain/errors";

export interface ScopeInput {
  userId: string;
  /** The session's active Account (`session.activeOrganizationId`), if set. */
  activeAccountId?: string | null;
}

export async function resolveScope(input: ScopeInput): Promise<Scope> {
  const memberships = await db
    .select({ accountId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, input.userId));

  // Prefer the session's active Account; otherwise the user's single membership.
  const chosen = input.activeAccountId
    ? memberships.find((m) => m.accountId === input.activeAccountId)
    : memberships[0];

  if (!chosen) {
    throw new NotFoundError("User has no Account membership");
  }

  // v1: each Account has exactly one Location (ADR-0003).
  const locations = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.accountId, chosen.accountId))
    .limit(1);

  const loc = locations[0];
  if (!loc) {
    throw new NotFoundError("Account has no Location");
  }

  return scopeFromSession({
    accountId: chosen.accountId,
    locationId: loc.id,
    role: toRole(chosen.role),
  });
}
