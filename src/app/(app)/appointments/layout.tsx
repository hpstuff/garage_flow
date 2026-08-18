import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getScope } from "@/app/lib/session";
import { isScheduleEnabled } from "@/server/services/location/service";

/**
 * Route guard for the Appointments feature (GF-20): a Location that has turned
 * off working-schedule enforcement doesn't get Appointments at all, not just a
 * hidden nav item — bounces straight navigation to `/appointments` back to the
 * dashboard. The parent `(app)/layout.tsx` already guarantees a scope here (it
 * redirects to `/login` first), so a missing scope is defensive, not expected.
 */
export default async function AppointmentsLayout({ children }: { children: ReactNode }) {
  const scope = await getScope();
  if (scope && !(await isScheduleEnabled(scope))) {
    redirect("/dashboard");
  }
  return children;
}
