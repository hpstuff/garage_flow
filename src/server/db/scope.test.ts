import { describe, expect, it } from "vitest";
import { scopeFromSession, toRole } from "./scope";

describe("toRole", () => {
  it("passes through known roles", () => {
    expect(toRole("owner")).toBe("owner");
    expect(toRole("manager")).toBe("manager");
    expect(toRole("front-desk")).toBe("front-desk");
  });

  it("maps unknown / missing roles to the least-privileged role", () => {
    expect(toRole("admin")).toBe("front-desk");
    expect(toRole(null)).toBe("front-desk");
    expect(toRole(undefined)).toBe("front-desk");
  });
});

describe("scopeFromSession", () => {
  it("carries account, location and role", () => {
    const scope = scopeFromSession({
      accountId: "acc_1",
      locationId: "loc_1",
      role: "owner",
    });

    expect(scope.accountId).toBe("acc_1");
    expect(scope.locationId).toBe("loc_1");
    expect(scope.role).toBe("owner");
  });
});
