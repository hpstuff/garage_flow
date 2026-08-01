import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { resolveScope } from "@/server/auth/resolve-scope";
import type { Scope } from "@/server/db";
import { UnauthenticatedError } from "@/server/domain/errors";

/**
 * Adapter-layer bridge: read the request session and resolve it to a `Scope`.
 *
 * This is the boundary seam — it depends on `next/headers` (why it lives in
 * src/app, not src/server), but the actual session → scope mapping is the core
 * `resolveScope` (ADR-0013/0014). Returns null when there is no valid session.
 *
 * Prefer {@link requireScope} in Server Actions; reach for the nullable
 * `getScope` only where the absence of a session is a normal branch — e.g. a
 * layout that redirects to /login rather than surfacing an error.
 */
export async function getScope(): Promise<Scope | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }

  const activeAccountId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  return resolveScope({ userId: session.user.id, activeAccountId });
}

/**
 * The single "authenticated + scoped" gate every Server Action passes through
 * (GF-03, ADR-0014): resolve the request session to a `Scope`, or throw
 * `UnauthenticatedError` when there is none. The thrown error is a domain error,
 * so the action's existing `isDomainError` adapter translates it to the
 * `UNAUTHENTICATED` code — no action hand-writes the guard. This is how every
 * authenticated request carries the Location scope automatically.
 */
export async function requireScope(): Promise<Scope> {
  const scope = await getScope();
  if (!scope) {
    throw new UnauthenticatedError();
  }
  return scope;
}
