import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber } from "./format";

describe("formatMoney", () => {
  it("treats the amount as integer minor units (ADR-0011/0017)", () => {
    // 12345 minor units = 123,45 in the major unit — never float math.
    expect(formatMoney(12345, "BGN")).toContain("123,45");
    expect(formatMoney(0, "EUR")).toContain("0,00");
  });

  it("uses the Bulgarian locale's decimal comma", () => {
    const formatted = formatNumber(1234.5);
    expect(formatted).toContain(",5");
    expect(formatted).not.toContain(".5");
  });
});
