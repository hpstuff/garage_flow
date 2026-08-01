import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { listMechanicsAction } from "./_actions/mechanic-actions";

/**
 * Mechanic list (GF-07) — browse the assignable workers within the current
 * Location scope, with an optional name search. From here the front desk adds a
 * Mechanic or edits one; the same list feeds the Repair Order lead and Labor
 * Line Item pickers once those slices land.
 */
export default async function MechanicsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const t = await getTranslations("mechanics");
  const { search } = await searchParams;

  const result = await listMechanicsAction(search);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const mechanics = result.data;
  const hasSearch = Boolean(search && search.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/mechanics/new" className={buttonVariants()}>
          {t("new")}
        </Link>
      </div>

      <form className="flex max-w-md gap-2">
        <Input
          type="search"
          name="search"
          defaultValue={search ?? ""}
          placeholder={t("search")}
          aria-label={t("search")}
        />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          {t("searchAction")}
        </button>
      </form>

      {mechanics.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasSearch ? t("noResults") : t("empty")}
            {!hasSearch ? <p className="mt-1 text-sm">{t("emptyHint")}</p> : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.note")}</TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mechanics.map((mechanic) => (
                <TableRow key={mechanic.id}>
                  <TableCell className="font-medium">{mechanic.name}</TableCell>
                  <TableCell className="text-muted-foreground">{mechanic.note ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(mechanic.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/mechanics/${mechanic.id}/edit`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      {t("edit")}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
