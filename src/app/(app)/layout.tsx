import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getScope } from "@/app/lib/session";
import { LogoutButton } from "./_components/logout-button";

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
  const tNav = await getTranslations("nav");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <span className="font-semibold">{tApp("name")}</span>
        <LogoutButton />
      </header>
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r p-4">
          <nav className="flex flex-col gap-1">
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {tNav("dashboard")}
            </Link>
            <Link
              href="/customers"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {tNav("customers")}
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
