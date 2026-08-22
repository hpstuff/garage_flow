import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getScope } from "@/app/lib/session";
import { isKanbanEnabled } from "@/server/services/location/service";

/**
 * Route guard for the Kanban board (GF-22): a Location that has turned the
 * Kanban board off doesn't get the board at all, not just a hidden nav
 * item — bounces direct navigation to `/repair-orders/board` back to the Repair
 * Orders list. The parent `(app)/layout.tsx` already guarantees a scope here
 * (it redirects to `/login` first), so a missing scope is defensive, not
 * expected. The Repair Orders list is the natural fallback since Kanban is
 * just one view over the same data.
 */
export default async function BoardLayout({ children }: { children: ReactNode }) {
  const scope = await getScope();
  if (scope && !(await isKanbanEnabled(scope))) {
    redirect("/repair-orders");
  }
  return children;
}
