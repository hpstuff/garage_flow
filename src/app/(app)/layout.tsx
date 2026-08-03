import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getScope } from "@/app/lib/session";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppBreadcrumb } from "./_components/app-breadcrumb";
import { AppSidebarNav } from "./_components/app-sidebar-nav";
import { BreadcrumbProvider } from "./_components/breadcrumb-context";
import { LogoutButton } from "./_components/logout-button";
import { VehicleSearch } from "./_components/vehicle-search";

/**
 * Authenticated app shell (ADR-0017): the layout guards access (no scope →
 * /login) and provides the header + sidebar every operational page sits in.
 * The Location concept stays hidden from the chrome per ADR-0003.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const scope = await getScope();
  if (!scope) {
    redirect("/login");
  }

  const tApp = await getTranslations("app");

  return (
    <BreadcrumbProvider>
      <SidebarProvider>
        <Sidebar className="print:hidden">
          <SidebarHeader>
            <span className="font-semibold">{tApp("name")}</span>
          </SidebarHeader>
          <SidebarContent>
            <AppSidebarNav />
          </SidebarContent>
          <SidebarFooter>
            <LogoutButton />
          </SidebarFooter>
        </Sidebar>
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4 print:hidden">
            <AppBreadcrumb />
            <div className="flex flex-1 justify-center">
              <VehicleSearch />
            </div>
          </header>
          <main className="flex-1 p-6 print:p-0">{children}</main>
        </div>
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
