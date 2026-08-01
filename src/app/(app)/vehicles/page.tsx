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
import { listVehiclesAction } from "./_actions/vehicle-actions";

/**
 * Vehicle list (GF-05) — browse Vehicles within the current Location scope, with
 * an optional plate/VIN/owner search (ADR-0008). From here the front desk opens
 * a Vehicle or adds a new one against its owner.
 */
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const t = await getTranslations("vehicles");
  const tKind = await getTranslations("vehicles.kind");
  const { search } = await searchParams;

  const result = await listVehiclesAction(search);
  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") {
      redirect("/login");
    }
    return <p className="text-destructive">{t("error")}</p>;
  }

  const vehicles = result.data;
  const hasSearch = Boolean(search && search.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/vehicles/new" className={buttonVariants()}>
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

      {vehicles.length === 0 ? (
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
                <TableHead>{t("columns.plate")}</TableHead>
                <TableHead>{t("columns.vehicle")}</TableHead>
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead>{t("columns.owner")}</TableHead>
                <TableHead>{t("columns.createdAt")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((vehicle) => {
                const description = [vehicle.make, vehicle.model, vehicle.year]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-medium">
                      <Link href={`/vehicles/${vehicle.id}`} className="hover:underline">
                        {vehicle.plate ?? vehicle.vin ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={vehicle.kind === "motorcycle" ? "info" : "secondary"}>
                        {tKind(vehicle.kind)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{vehicle.customerName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(vehicle.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/vehicles/${vehicle.id}/edit`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        {t("edit")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
