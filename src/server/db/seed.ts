/**
 * Dev seed: one Account, one owner User, one Location — the minimum to exercise
 * the walking skeleton (login → Location-scoped dashboard). Run `npm run db:seed`
 * after `npm run db:migrate`. Idempotent on the demo user's email.
 *
 * The User is created through Better Auth (`signUpEmail`) so the password is
 * hashed correctly; the Account/membership/Location are inserted directly.
 */

import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local", override: false });
config({ path: ".env", override: false });

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const { auth } = await import("../auth/auth");
  const { db } = await import("./client");
  const { location, member, organization, user } = await import("./schema");

  const email = process.env.SEED_EMAIL ?? "owner@example.com";
  const password = process.env.SEED_PASSWORD ?? "password12345";
  const accountName = "Демо Сервиз";
  const locationName = "Главен сервиз";

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing[0]) {
    console.log(`✓ seed user ${email} already exists — nothing to do`);
    return;
  }

  const signUp = await auth.api.signUpEmail({ body: { email, password, name: "Собственик" } });
  const userId = signUp.user.id;

  const accountId = randomUUID();
  await db.insert(organization).values({ id: accountId, name: accountName, createdAt: new Date() });
  await db.insert(member).values({
    id: randomUUID(),
    organizationId: accountId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  await db.insert(location).values({ accountId, name: locationName });

  console.log("✓ seeded:");
  console.log(`   Account:  ${accountName}`);
  console.log(`   Location: ${locationName}`);
  console.log(`   Login:    ${email} / ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
