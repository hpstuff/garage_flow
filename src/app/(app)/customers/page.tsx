import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
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
import { listCustomersAction } from "./_actions/customer-actions";

/**
 * Customer list (GF-04) — browse Customers within the current Location scope,
 * with an optional search. The list is the core-loop entry point; from here the
 * front desk opens a Customer or adds a new one.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const t = await getTranslations("customers");
  const tKind = await getTranslations("customers.kind");
  const { search } = await searchParams;

  const result = await listCustomersAction(search);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const customers = result.data;
  const hasSearch = Boolean(search && search.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/customers/new" className={buttonVariants()}>
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

      {customers.length === 0 ? (
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
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead>{t("columns.contact")}</TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>
                    <Badge variant={customer.kind === "organization" ? "info" : "secondary"}>
                      {tKind(customer.kind)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.phone ?? customer.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(customer.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/customers/${customer.id}/edit`}
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
