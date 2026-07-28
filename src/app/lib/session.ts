import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { resolveScope } from "@/server/auth/resolve-scope";
import type { Scope } from "@/server/db";

/**
 * Adapter-layer bridge: read the request session and resolve it to a `Scope`.
 *
 * This is the boundary seam — it depends on `next/headers` (why it lives in
 * src/app, not src/server), but the actual session → scope mapping is the core
 * `resolveScope` (ADR-0013/0014). Returns null when there is no valid session.
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
