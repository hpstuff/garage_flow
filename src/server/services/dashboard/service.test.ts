import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { location, organization } from "../../db/schema";
import { scopeFromSession } from "../../db/scope";
import { ValidationError } from "../../domain/errors";
import { getDashboard } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("getDashboard — validation (no DB)", () => {
  it("rejects unexpected input with a ValidationError (ADR-0016)", async () => {
    const scope = scopeFromSession({ accountId: "x", locationId: "y", role: "owner" });
    // Strict schema: unknown keys are rejected before any DB access.
    await expect(getDashboard(scope, { unexpected: true })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe.skipIf(!hasDb)("getDashboard — integration (real Postgres, ADR-0018)", () => {
  const accountId = `acc_${randomUUID()}`;

  afterAll(async () => {
    // Cascades to the Location.
    await db.delete(organization).where(eq(organization.id, accountId));
  });

  it("returns the scoped Location and an empty metric snapshot", async () => {
    await db.insert(organization).values({
      id: accountId,
      name: "Test Account",
      createdAt: new Date(),
    });
    const [loc] = await db
      .insert(location)
      .values({ accountId, name: "Главен сервиз" })
      .returning({ id: location.id });

    if (!loc) throw new Error("failed to seed location");

    const scope = scopeFromSession({ accountId, locationId: loc.id, role: "owner" });
    const data = await getDashboard(scope, {});

    expect(data.location).toEqual({ id: loc.id, name: "Главен сервиз" });
    expect(data.metrics).toEqual({ activeRepairOrders: 0, customers: 0, vehicles: 0 });
  });
});
